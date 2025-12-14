use crate::{
    domain::{id::ID, models::ShortenedURL, repository::ShortenedURLRepository},
    scylla::config::Config,
};
use actix_web::cookie::time::Date;
use anyhow::{Ok, Result, anyhow};
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
    pub ps_get_current_id: PreparedStatement,
    pub ps_get_next_id: PreparedStatement,
}

impl DB {
    async fn prepare_statement(
        session: &Session,
        statement: &'static str,
    ) -> Result<PreparedStatement> {
        session
            .prepare(statement)
            .await
            .map_err(|e| anyhow!("Failed to prepare statement '{}': {}", statement, e))
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

        let ps_insert_url = Self::prepare_statement(&session, INSERT_URL_QUERY).await?;
        let ps_find_url = Self::prepare_statement(&session, FIND_URL_QUERY).await?;
        let ps_get_current_id = Self::prepare_statement(&session, GET_CURRENT_ID_QUERY).await?;
        let ps_get_next_id = Self::prepare_statement(&session, GET_NEXT_ID_QUERY).await?;

        Ok(Self {
            session,
            ps_insert_url,
            ps_find_url,
            ps_get_current_id,
            ps_get_next_id,
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
        self.session
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

        Ok(ShortenedURL {
            id,
            original_url,
            created_at,
            expires_at,
        })
    }

    async fn find_by_id(&self, id: &str) -> Result<Option<ShortenedURL>> {
        let result = self
            .session
            .execute_unpaged(&self.ps_find_url, (id,))
            .await?
            .into_rows_result()?
            .maybe_first_row::<(String, DateTime<Utc>, Option<DateTime<Utc>>)>()?;

        if let Some((original_url, created_at, expires_at)) = result {
            Ok(Some(ShortenedURL {
                id: ID::new(id.to_string()),
                original_url: Url::parse(&original_url)?,
                created_at,
                expires_at,
            }))
        } else {
            Ok(None)
        }
    }
}
