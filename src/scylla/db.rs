use crate::{
    domain::{
        id::ID,
        models::{ShortUrlState, ShortenedURL},
        repository::ShortenedURLRepository,
    },
    scylla::config::Config,
};
use anyhow::{Result, anyhow};
use backon::ExponentialBuilder;
use backon::Retryable;
use chrono::DateTime;
use chrono::Utc;
use const_format::formatcp;
use rustls::{
    ClientConfig, RootCertStore,
    pki_types::{CertificateDer, PrivateKeyDer},
};
use scylla::client::{Compression, session::Session};
use scylla::{client::session_builder::SessionBuilder, statement::prepared::PreparedStatement};
use scylla::{response::PagingState, statement::unprepared::Statement};
use std::{fs::File, path::Path, time::Duration};
use std::{io::BufReader, sync::Arc};
use url::Url;

fn load_certs(path: impl AsRef<Path>) -> std::io::Result<Vec<CertificateDer<'static>>> {
    let file = File::open(path.as_ref())?;
    let mut reader = BufReader::new(file);
    rustls_pemfile::certs(&mut reader).collect()
}

fn load_private_key(path: impl AsRef<Path>) -> std::io::Result<PrivateKeyDer<'static>> {
    let file = File::open(path.as_ref())?;
    let mut reader = BufReader::new(file);
    rustls_pemfile::private_key(&mut reader).and_then(|keys| {
        keys.ok_or(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "No private key found",
        ))
    })
}

fn create_tls_config(config: &Config) -> Result<Option<Arc<ClientConfig>>> {
    let Some(ca_path) = &config.ca_cert_path else {
        return Ok(None);
    };

    let mut root_store = RootCertStore::empty();
    let certs = load_certs(ca_path)?;
    for cert in certs {
        root_store.add(cert)?;
    }

    let builder = ClientConfig::builder().with_root_certificates(root_store);

    let client_config = if let (Some(cert_path), Some(key_path)) =
        (&config.client_cert_path, &config.client_key_path)
    {
        let certs = load_certs(cert_path)?;
        let key = load_private_key(key_path)?;
        builder.with_client_auth_cert(certs, key)?
    } else {
        builder.with_no_client_auth()
    };

    Ok(Some(Arc::new(client_config)))
}

const SHORT_URL_TABLE_NAME: &str = "short_urls";
const CREATE_SHORT_URL_TABLE_QUERY: &str = formatcp!(
    r#"
    CREATE TABLE IF NOT EXISTS {SHORT_URL_TABLE_NAME} (
        id text,
        original_url text,
        created_at timestamp,
        expires_at timestamp,
        PRIMARY KEY (id)
    )
"#,
);
const INSERT_URL_QUERY: &str = formatcp!(
    r#"
    INSERT INTO {SHORT_URL_TABLE_NAME} (id, original_url, created_at, expires_at)
    VALUES (?, ?, ?, ?) IF NOT EXISTS
"#,
);
const FIND_URL_QUERY: &str = formatcp!(
    r#"
    SELECT original_url, created_at, expires_at FROM {SHORT_URL_TABLE_NAME} WHERE id = ?
"#,
);

const LIST_ALL_URLS_QUERY: &str = formatcp!(
    r#"
    SELECT id, original_url, created_at, expires_at FROM {SHORT_URL_TABLE_NAME}
"#,
);

const SHORT_URLS_BY_CREATED_AT_TABLE_NAME: &str = "short_urls_by_created_at";
const SHORT_URLS_BY_CREATED_AT_BUCKET: &str = "all";
const CREATE_SHORT_URLS_BY_CREATED_AT_TABLE_QUERY: &str = formatcp!(
    r#"
    CREATE TABLE IF NOT EXISTS {SHORT_URLS_BY_CREATED_AT_TABLE_NAME} (
        bucket text,
        created_at timestamp,
        id text,
        original_url text,
        expires_at timestamp,
        PRIMARY KEY (bucket, created_at, id)
    ) WITH CLUSTERING ORDER BY (created_at DESC, id ASC)
"#
);
const INSERT_URL_BY_CREATED_AT_QUERY: &str = formatcp!(
    r#"
    INSERT INTO {SHORT_URLS_BY_CREATED_AT_TABLE_NAME} (bucket, created_at, id, original_url, expires_at)
    VALUES (?, ?, ?, ?, ?) IF NOT EXISTS
"#
);
const LIST_BY_CREATED_AT_QUERY: &str = formatcp!(
    r#"
    SELECT created_at, id, original_url, expires_at FROM {SHORT_URLS_BY_CREATED_AT_TABLE_NAME} WHERE bucket = ?
"#
);
const CHECK_BY_CREATED_AT_ANY_QUERY: &str = formatcp!(
    r#"
    SELECT id FROM {SHORT_URLS_BY_CREATED_AT_TABLE_NAME} WHERE bucket = ? LIMIT 1
"#
);

const SHORT_URL_STATE_TABLE_NAME: &str = "short_url_state";
const CREATE_SHORT_URL_STATE_TABLE_QUERY: &str = formatcp!(
    r#"
    CREATE TABLE IF NOT EXISTS {SHORT_URL_STATE_TABLE_NAME} (
        id text,
        enabled boolean,
        disabled_at timestamp,
        updated_at timestamp,
        PRIMARY KEY (id)
    )
"#
);
const UPSERT_SHORT_URL_STATE_QUERY: &str = formatcp!(
    r#"
    INSERT INTO {SHORT_URL_STATE_TABLE_NAME} (id, enabled, disabled_at, updated_at)
    VALUES (?, ?, ?, ?)
"#
);
const GET_SHORT_URL_STATE_QUERY: &str = formatcp!(
    r#"
    SELECT enabled, disabled_at, updated_at FROM {SHORT_URL_STATE_TABLE_NAME} WHERE id = ?
"#
);

const SHORT_URL_LAST_ACCESS_TABLE_NAME: &str = "short_url_last_access";
const CREATE_SHORT_URL_LAST_ACCESS_TABLE_QUERY: &str = formatcp!(
    r#"
    CREATE TABLE IF NOT EXISTS {SHORT_URL_LAST_ACCESS_TABLE_NAME} (
        id text,
        last_access_at timestamp,
        last_status_code int,
        PRIMARY KEY (id)
    )
"#
);
const UPSERT_SHORT_URL_LAST_ACCESS_QUERY: &str = formatcp!(
    r#"
    INSERT INTO {SHORT_URL_LAST_ACCESS_TABLE_NAME} (id, last_access_at, last_status_code)
    VALUES (?, ?, ?)
"#
);
const GET_SHORT_URL_LAST_ACCESS_QUERY: &str = formatcp!(
    r#"
    SELECT last_access_at, last_status_code FROM {SHORT_URL_LAST_ACCESS_TABLE_NAME} WHERE id = ?
"#
);

const SHORT_URL_CREATE_LOGS_TABLE_NAME: &str = "short_url_create_logs";
const CREATE_SHORT_URL_CREATE_LOGS_TABLE_QUERY: &str = formatcp!(
    r#"
    CREATE TABLE IF NOT EXISTS {SHORT_URL_CREATE_LOGS_TABLE_NAME} (
        id text,
        ts timestamp,
        ip text,
        user_agent text,
        original_url text,
        request_id text,
        PRIMARY KEY (id, ts)
    ) WITH CLUSTERING ORDER BY (ts DESC)
"#
);
const INSERT_CREATE_LOG_QUERY: &str = formatcp!(
    r#"
    INSERT INTO {SHORT_URL_CREATE_LOGS_TABLE_NAME} (id, ts, ip, user_agent, original_url, request_id)
    VALUES (?, ?, ?, ?, ?, ?) USING TTL ?
"#
);

const SHORT_URL_ACCESS_LOGS_TABLE_NAME: &str = "short_url_access_logs";
const CREATE_SHORT_URL_ACCESS_LOGS_TABLE_QUERY: &str = formatcp!(
    r#"
    CREATE TABLE IF NOT EXISTS {SHORT_URL_ACCESS_LOGS_TABLE_NAME} (
        id text,
        ts timestamp,
        ip text,
        user_agent text,
        request_id text,
        status_code int,
        PRIMARY KEY (id, ts)
    ) WITH CLUSTERING ORDER BY (ts DESC)
"#
);
const INSERT_ACCESS_LOG_QUERY: &str = formatcp!(
    r#"
    INSERT INTO {SHORT_URL_ACCESS_LOGS_TABLE_NAME} (id, ts, ip, user_agent, request_id, status_code)
    VALUES (?, ?, ?, ?, ?, ?) USING TTL ?
"#
);

const LIST_ACCESS_LOGS_QUERY: &str = formatcp!(
    r#"
    SELECT ts, ip, user_agent, request_id, status_code FROM {SHORT_URL_ACCESS_LOGS_TABLE_NAME} WHERE id = ?
"#
);

const SHORT_URL_CREATE_META_TABLE_NAME: &str = "short_url_create_meta";
const CREATE_SHORT_URL_CREATE_META_TABLE_QUERY: &str = formatcp!(
    r#"
    CREATE TABLE IF NOT EXISTS {SHORT_URL_CREATE_META_TABLE_NAME} (
        id text,
        created_at timestamp,
        ip text,
        user_agent text,
        request_id text,
        PRIMARY KEY (id)
    )
"#
);
const INSERT_CREATE_META_IF_ABSENT_QUERY: &str = formatcp!(
    r#"
    INSERT INTO {SHORT_URL_CREATE_META_TABLE_NAME} (id, created_at, ip, user_agent, request_id)
    VALUES (?, ?, ?, ?, ?) IF NOT EXISTS USING TTL ?
"#
);
const GET_CREATE_META_QUERY: &str = formatcp!(
    r#"
    SELECT created_at, ip, user_agent, request_id FROM {SHORT_URL_CREATE_META_TABLE_NAME} WHERE id = ?
"#
);

const LOG_TTL_SECONDS_30D: i32 = 60 * 60 * 24 * 30;

const ID_SEQ_TABLE_NAME: &str = "id_seq";
const ID_SEQ_KEY_NAME: &str = "short_url_id";
const CREATE_ID_SEQ_TABLE_QUERY: &str = formatcp!(
    r#"
    CREATE TABLE IF NOT EXISTS {ID_SEQ_TABLE_NAME} (
        name text,
        current_id bigint,
        PRIMARY KEY (name)
    )
"#,
);

const GET_CURRENT_ID_QUERY: &str = formatcp!(
    r#"
    SELECT current_id FROM {ID_SEQ_TABLE_NAME} WHERE name = '{ID_SEQ_KEY_NAME}'
"#,
);
const GET_NEXT_ID_QUERY: &str = formatcp!(
    r#"
    UPDATE {ID_SEQ_TABLE_NAME} SET current_id = ? WHERE name = '{ID_SEQ_KEY_NAME}' IF current_id = ?
"#,
);

pub struct DB {
    pub session: Session,
    pub ps_insert_url: PreparedStatement,
    pub ps_find_url: PreparedStatement,
    pub ps_list_all_urls: PreparedStatement,
    pub ps_insert_url_by_created_at: PreparedStatement,
    pub ps_list_by_created_at: PreparedStatement,
    pub ps_get_current_id: PreparedStatement,
    pub ps_get_next_id: PreparedStatement,

    pub ps_upsert_state: PreparedStatement,
    pub ps_get_state: PreparedStatement,

    pub ps_upsert_last_access: PreparedStatement,
    pub ps_get_last_access: PreparedStatement,

    pub ps_insert_create_log: PreparedStatement,
    pub ps_insert_access_log: PreparedStatement,
    pub ps_list_access_logs: PreparedStatement,

    pub ps_insert_create_meta_if_absent: PreparedStatement,
    pub ps_get_create_meta: PreparedStatement,
}

impl DB {
    async fn prepare_statement(
        session: &Session,
        statement: Statement,
    ) -> Result<PreparedStatement> {
        session
            .prepare(statement.clone())
            .await
            .map_err(|e| anyhow!("Failed to prepare statement {}: {}", statement.contents, e))
    }

    pub async fn new(config: Config) -> Result<Self> {
        let tls_context = create_tls_config(&config)?;

        let session = SessionBuilder::new()
            .known_node(config.url)
            .user(config.user, config.password)
            .tls_context(tls_context)
            .compression(Some(Compression::Lz4))
            .build()
            .await?;

        session
            .use_keyspace(&config.keyspace, true)
            .await
            .map_err(|e| anyhow!("Failed to use keyspace '{}': {}", &config.keyspace, e))?;

        session
            .query_unpaged(CREATE_SHORT_URL_TABLE_QUERY, &[])
            .await
            .map_err(|e| anyhow!("Failed to create table '{}': {}", SHORT_URL_TABLE_NAME, e))?;

        session
            .query_unpaged(CREATE_SHORT_URL_STATE_TABLE_QUERY, &[])
            .await
            .map_err(|e| {
                anyhow!(
                    "Failed to create table '{}': {}",
                    SHORT_URL_STATE_TABLE_NAME,
                    e
                )
            })?;

        session
            .query_unpaged(CREATE_SHORT_URL_LAST_ACCESS_TABLE_QUERY, &[])
            .await
            .map_err(|e| {
                anyhow!(
                    "Failed to create table '{}': {}",
                    SHORT_URL_LAST_ACCESS_TABLE_NAME,
                    e
                )
            })?;

        session
            .query_unpaged(CREATE_SHORT_URL_CREATE_LOGS_TABLE_QUERY, &[])
            .await
            .map_err(|e| {
                anyhow!(
                    "Failed to create table '{}': {}",
                    SHORT_URL_CREATE_LOGS_TABLE_NAME,
                    e
                )
            })?;

        session
            .query_unpaged(CREATE_SHORT_URL_ACCESS_LOGS_TABLE_QUERY, &[])
            .await
            .map_err(|e| {
                anyhow!(
                    "Failed to create table '{}': {}",
                    SHORT_URL_ACCESS_LOGS_TABLE_NAME,
                    e
                )
            })?;

        session
            .query_unpaged(CREATE_SHORT_URLS_BY_CREATED_AT_TABLE_QUERY, &[])
            .await
            .map_err(|e| {
                anyhow!(
                    "Failed to create table '{}': {}",
                    SHORT_URLS_BY_CREATED_AT_TABLE_NAME,
                    e
                )
            })?;

        session
            .query_unpaged(CREATE_SHORT_URL_CREATE_META_TABLE_QUERY, &[])
            .await
            .map_err(|e| {
                anyhow!(
                    "Failed to create table '{}': {}",
                    SHORT_URL_CREATE_META_TABLE_NAME,
                    e
                )
            })?;

        session
            .query_unpaged(CREATE_ID_SEQ_TABLE_QUERY, &[])
            .await
            .map_err(|e| anyhow!("Failed to create table '{}': {}", ID_SEQ_TABLE_NAME, e))?;
        session
            .query_unpaged(
                format!(
                    "INSERT INTO {} (name, current_id) VALUES (?, 0) IF NOT EXISTS",
                    ID_SEQ_TABLE_NAME
                ),
                (ID_SEQ_KEY_NAME,),
            )
            .await
            .map_err(|e| {
                anyhow!(
                    "Failed to initialize ID sequence in table '{}': {}",
                    ID_SEQ_TABLE_NAME,
                    e
                )
            })?;
        let ps_insert_url =
            Self::prepare_statement(&session, Statement::new(INSERT_URL_QUERY)).await?;
        let ps_find_url = Self::prepare_statement(&session, Statement::new(FIND_URL_QUERY)).await?;
        let ps_list_all_urls =
            Self::prepare_statement(&session, Statement::new(LIST_ALL_URLS_QUERY)).await?;
        let ps_insert_url_by_created_at =
            Self::prepare_statement(&session, Statement::new(INSERT_URL_BY_CREATED_AT_QUERY))
                .await?;
        let ps_list_by_created_at = Self::prepare_statement(
            &session,
            Statement::new(LIST_BY_CREATED_AT_QUERY).with_page_size(20.try_into().unwrap()),
        )
        .await?;
        let ps_get_current_id =
            Self::prepare_statement(&session, Statement::new(GET_CURRENT_ID_QUERY)).await?;
        let ps_get_next_id =
            Self::prepare_statement(&session, Statement::new(GET_NEXT_ID_QUERY)).await?;

        let ps_upsert_state =
            Self::prepare_statement(&session, Statement::new(UPSERT_SHORT_URL_STATE_QUERY)).await?;
        let ps_get_state =
            Self::prepare_statement(&session, Statement::new(GET_SHORT_URL_STATE_QUERY)).await?;

        let ps_upsert_last_access =
            Self::prepare_statement(&session, Statement::new(UPSERT_SHORT_URL_LAST_ACCESS_QUERY))
                .await?;
        let ps_get_last_access =
            Self::prepare_statement(&session, Statement::new(GET_SHORT_URL_LAST_ACCESS_QUERY))
                .await?;

        let ps_insert_create_log =
            Self::prepare_statement(&session, Statement::new(INSERT_CREATE_LOG_QUERY)).await?;
        let ps_insert_access_log =
            Self::prepare_statement(&session, Statement::new(INSERT_ACCESS_LOG_QUERY)).await?;
        let ps_list_access_logs =
            Self::prepare_statement(&session, Statement::new(LIST_ACCESS_LOGS_QUERY)).await?;

        let ps_insert_create_meta_if_absent =
            Self::prepare_statement(&session, Statement::new(INSERT_CREATE_META_IF_ABSENT_QUERY))
                .await?;
        let ps_get_create_meta =
            Self::prepare_statement(&session, Statement::new(GET_CREATE_META_QUERY)).await?;

        // Best-effort backfill: make existing short_urls visible in the created_at-ordered listing
        // table. This prevents the admin list from showing only newly-created links after rollout.
        let has_any = session
            .query_unpaged(
                CHECK_BY_CREATED_AT_ANY_QUERY,
                (SHORT_URLS_BY_CREATED_AT_BUCKET,),
            )
            .await
            .ok()
            .and_then(|qr| qr.into_rows_result().ok())
            .and_then(|rr| rr.maybe_first_row::<(String,)>().ok())
            .flatten()
            .is_some();

        if !has_any {
            if let Ok(qr) = session.execute_unpaged(&ps_list_all_urls, &[]).await {
                if let Ok(rows) = qr.into_rows_result() {
                    if let Ok(iter) =
                        rows.rows::<(String, String, DateTime<Utc>, Option<DateTime<Utc>>)>()
                    {
                        for row in iter {
                            if let Ok((id, original_url, created_at, expires_at)) = row {
                                let _ = session
                                    .execute_unpaged(
                                        &ps_insert_url_by_created_at,
                                        (
                                            SHORT_URLS_BY_CREATED_AT_BUCKET,
                                            created_at,
                                            id.as_str(),
                                            original_url.as_str(),
                                            expires_at,
                                        ),
                                    )
                                    .await;
                            }
                        }
                    }
                }
            }
        }

        Ok(Self {
            session,
            ps_insert_url,
            ps_find_url,
            ps_list_all_urls,
            ps_insert_url_by_created_at,
            ps_list_by_created_at,
            ps_get_current_id,
            ps_get_next_id,

            ps_upsert_state,
            ps_get_state,

            ps_upsert_last_access,
            ps_get_last_access,

            ps_insert_create_log,
            ps_insert_access_log,
            ps_list_access_logs,

            ps_insert_create_meta_if_absent,
            ps_get_create_meta,
        })
    }

    async fn get_next_id(&self) -> Result<i64> {
        let current_id_row = self
            .session
            .execute_unpaged(&self.ps_get_current_id, &[])
            .await?
            .into_rows_result()?
            .first_row::<(i64,)>()?;

        let current_id = current_id_row.0;

        let result = self
            .session
            .execute_unpaged(&self.ps_get_next_id, (current_id + 1, current_id))
            .await?
            .into_rows_result()?
            .maybe_first_row::<(bool, i64)>()?;
        tracing::debug!(result = ?result, "Get next ID result");

        if let Some((applied, _)) = result {
            if applied {
                return Ok(current_id + 1);
            }
        }
        Err(anyhow::anyhow!("Failed to get next ID"))
    }
}

impl ShortenedURLRepository for Arc<DB> {
    async fn create(
        &self,
        original_url: Url,
        custom_id: Option<&str>,
        expires_at: Option<DateTime<Utc>>,
    ) -> Result<ShortenedURL> {
        let id = match custom_id {
            Some(cid) => ID::new(cid.to_string()),
            None => {
                let retry_policy = ExponentialBuilder::default()
                    .with_min_delay(Duration::from_millis(100))
                    .with_max_delay(Duration::from_secs(5))
                    .with_factor(2.0)
                    .with_jitter()
                    .with_max_times(5);

                let a = || async {
                    return self.get_next_id().await;
                };

                let seq = a.retry(retry_policy).sleep(tokio::time::sleep).await?;

                ID::generate(seq)?
            }
        };

        let created_at = Utc::now();

        // INSERT ... IF NOT EXISTS can return existing row values when not applied.
        // We use that to avoid overwriting state and to avoid duplicating index rows.
        let insert_res = self
            .session
            .execute_unpaged(
                &self.ps_insert_url,
                (
                    id.0.as_str(),
                    original_url.to_string(),
                    created_at,
                    expires_at,
                ),
            )
            .await?;

        // NOTE: For LWT (IF NOT EXISTS), Scylla returns extra columns alongside `[applied]`.
        // The column order here is what Scylla returns for this statement:
        // ([applied], id, created_at, expires_at, original_url).
        let insert_row = insert_res.into_rows_result()?.maybe_first_row::<(
            bool,
            Option<String>,
            Option<DateTime<Utc>>,
            Option<DateTime<Utc>>,
            Option<String>,
        )>()?;

        let (applied, final_original_url, final_created_at, final_expires_at) = match insert_row {
            Some((true, _, _, _, _)) => {
                // Inserted.
                (true, original_url, created_at, expires_at)
            }
            Some((false, _id, created_at, expires_at, original_url)) => {
                // Existing.
                let existing_original_url = original_url
                    .as_deref()
                    .ok_or_else(|| anyhow!("Failed to decode existing original_url"))?;
                let existing_created_at =
                    created_at.ok_or_else(|| anyhow!("Failed to decode existing created_at"))?;
                (
                    false,
                    Url::parse(existing_original_url)?,
                    existing_created_at,
                    expires_at,
                )
            }
            None => {
                // Some clusters might not return rows for IF NOT EXISTS.
                (true, original_url, created_at, expires_at)
            }
        };

        if applied {
            // Initialize state as enabled.
            self.session
                .execute_unpaged(
                    &self.ps_upsert_state,
                    (
                        id.0.as_str(),
                        true,
                        Option::<DateTime<Utc>>::None,
                        final_created_at,
                    ),
                )
                .await?;

            // Maintain created_at-ordered listing table.
            let _ = self
                .session
                .execute_unpaged(
                    &self.ps_insert_url_by_created_at,
                    (
                        SHORT_URLS_BY_CREATED_AT_BUCKET,
                        final_created_at,
                        id.0.as_str(),
                        final_original_url.to_string(),
                        final_expires_at,
                    ),
                )
                .await;
        }

        Ok(ShortenedURL {
            id,
            original_url: final_original_url,
            created_at: final_created_at,
            expires_at: final_expires_at,
        })
    }

    async fn find_by_id(&self, id: ID) -> Result<Option<ShortenedURL>> {
        let result = self
            .session
            .execute_unpaged(&self.ps_find_url, (id.0.as_str(),))
            .await?
            .into_rows_result()?
            .maybe_first_row::<(String, DateTime<Utc>, Option<DateTime<Utc>>)>()?;

        if let Some((original_url, created_at, expires_at)) = result {
            Ok(Some(ShortenedURL {
                id,
                original_url: Url::parse(&original_url)?,
                created_at,
                expires_at,
            }))
        } else {
            Ok(None)
        }
    }

    async fn list_by_created_at_page(
        &self,
        limit: i32,
        paging_state: Option<Vec<u8>>,
    ) -> Result<(Vec<ShortenedURL>, Option<Vec<u8>>)> {
        use scylla::response::PagingStateResponse;

        let page_size = limit.clamp(1, 100);
        let mut stmt = self.ps_list_by_created_at.clone();
        stmt.set_page_size(page_size);

        let paging_state = match paging_state {
            Some(raw) => PagingState::new_from_raw_bytes(raw),
            None => PagingState::start(),
        };

        let (res, paging_state_response) = self
            .session
            .execute_single_page(&stmt, (SHORT_URLS_BY_CREATED_AT_BUCKET,), paging_state)
            .await?;

        let rows = res.into_rows_result()?;
        let mut out = Vec::new();
        let iter = rows
            .rows::<(DateTime<Utc>, String, String, Option<DateTime<Utc>>)>()
            .map_err(|e| anyhow!("Failed to decode rows for list_by_created_at_page: {}", e))?;

        for row in iter {
            let (created_at, id, original_url, expires_at) = row
                .map_err(|e| anyhow!("Failed to decode row for list_by_created_at_page: {}", e))?;
            out.push(ShortenedURL {
                id: ID::new(id),
                original_url: Url::parse(&original_url)?,
                created_at,
                expires_at,
            });
        }

        let next_page_state = match paging_state_response {
            PagingStateResponse::NoMorePages => None,
            PagingStateResponse::HasMorePages { state } => {
                state.as_bytes_slice().map(|arc| arc.as_ref().to_vec())
            }
        };

        Ok((out, next_page_state))
    }

    async fn save_create_meta_if_absent(
        &self,
        id: &str,
        created_at: DateTime<Utc>,
        ip: Option<&str>,
        user_agent: Option<&str>,
        request_id: Option<&str>,
    ) -> Result<()> {
        let _ = self
            .session
            .execute_unpaged(
                &self.ps_insert_create_meta_if_absent,
                (
                    id,
                    created_at,
                    ip.unwrap_or(""),
                    user_agent.unwrap_or(""),
                    request_id.unwrap_or(""),
                    LOG_TTL_SECONDS_30D,
                ),
            )
            .await?;
        Ok(())
    }

    async fn get_create_meta(
        &self,
        id: &str,
    ) -> Result<Option<(DateTime<Utc>, String, String, String)>> {
        let result = self
            .session
            .execute_unpaged(&self.ps_get_create_meta, (id,))
            .await?
            .into_rows_result()?
            .maybe_first_row::<(DateTime<Utc>, String, String, String)>()?;

        Ok(result)
    }

    async fn get_state(&self, id: &str) -> Result<Option<ShortUrlState>> {
        let result = self
            .session
            .execute_unpaged(&self.ps_get_state, (id,))
            .await?
            .into_rows_result()?
            .maybe_first_row::<(Option<bool>, Option<DateTime<Utc>>, Option<DateTime<Utc>>)>()?;

        if let Some((enabled, disabled_at, updated_at)) = result {
            Ok(Some(ShortUrlState {
                id: ID::new(id.to_string()),
                enabled: enabled.unwrap_or(true),
                disabled_at,
                updated_at: updated_at.unwrap_or_else(Utc::now),
            }))
        } else {
            Ok(None)
        }
    }

    async fn set_enabled(&self, id: &str, enabled: bool, now: DateTime<Utc>) -> Result<()> {
        let disabled_at = if enabled { None } else { Some(now) };
        self.session
            .execute_unpaged(&self.ps_upsert_state, (id, enabled, disabled_at, now))
            .await?;
        Ok(())
    }

    async fn log_create(
        &self,
        id: &str,
        ts: DateTime<Utc>,
        ip: Option<&str>,
        user_agent: Option<&str>,
        original_url: &str,
        request_id: Option<&str>,
    ) -> Result<()> {
        self.session
            .execute_unpaged(
                &self.ps_insert_create_log,
                (
                    id,
                    ts,
                    ip.unwrap_or(""),
                    user_agent.unwrap_or(""),
                    original_url,
                    request_id.unwrap_or(""),
                    LOG_TTL_SECONDS_30D,
                ),
            )
            .await?;
        Ok(())
    }

    async fn log_access(
        &self,
        id: &str,
        ts: DateTime<Utc>,
        ip: Option<&str>,
        user_agent: Option<&str>,
        request_id: Option<&str>,
        status_code: i32,
    ) -> Result<()> {
        self.session
            .execute_unpaged(
                &self.ps_insert_access_log,
                (
                    id,
                    ts,
                    ip.unwrap_or(""),
                    user_agent.unwrap_or(""),
                    request_id.unwrap_or(""),
                    status_code,
                    LOG_TTL_SECONDS_30D,
                ),
            )
            .await?;
        Ok(())
    }

    async fn list_access_logs_recent(
        &self,
        id: &str,
        limit: i32,
    ) -> Result<Vec<(DateTime<Utc>, String, String, String, i32)>> {
        let page_size = limit.clamp(1, 500);
        let mut stmt = self.ps_list_access_logs.clone();
        stmt.set_page_size(page_size);

        let (res, _paging_state_response) = self
            .session
            .execute_single_page(&stmt, (id,), PagingState::start())
            .await?;

        let rows = res.into_rows_result()?;
        let iter = rows
            .rows::<(DateTime<Utc>, String, String, String, i32)>()
            .map_err(|e| anyhow!("Failed to decode rows for list_access_logs_recent: {}", e))?;

        let mut out = Vec::new();
        for row in iter {
            let (ts, ip, ua, rid, status_code) = row
                .map_err(|e| anyhow!("Failed to decode row for list_access_logs_recent: {}", e))?;
            out.push((ts, ip, ua, rid, status_code));
        }
        Ok(out)
    }

    async fn get_last_access(&self, id: &str) -> Result<Option<(DateTime<Utc>, i32)>> {
        let result = self
            .session
            .execute_unpaged(&self.ps_get_last_access, (id,))
            .await?
            .into_rows_result()?
            .maybe_first_row::<(Option<DateTime<Utc>>, Option<i32>)>()?;

        if let Some((ts, sc)) = result {
            if let Some(ts) = ts {
                return Ok(Some((ts, sc.unwrap_or(0))));
            }
        }
        Ok(None)
    }

    async fn set_last_access(&self, id: &str, ts: DateTime<Utc>, status_code: i32) -> Result<()> {
        self.session
            .execute_unpaged(&self.ps_upsert_last_access, (id, ts, status_code))
            .await?;
        Ok(())
    }
}
