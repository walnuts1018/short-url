use actix_web::{App, HttpServer, web};
use std::sync::Arc;
use tracing_subscriber::fmt::time::ChronoLocal;
use valuable::Valuable;
use walnuk::{
    config::{self, logger::LoggerConfig},
    handler::handlers::Handler,
    scylla::{self, db::DB},
};

fn build_logger(config: &LoggerConfig) {
    let builder = tracing_subscriber::fmt().with_timer(ChronoLocal::rfc_3339());

    match config.format {
        config::logger::LogFormat::Json => builder.json().init(),
        config::logger::LogFormat::Text => builder.init(),
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let cfg = match config::load() {
        Ok(cfg) => cfg,
        Err(err) => {
            eprintln!("Failed to load configuration: {}", err);
            std::process::exit(1);
        }
    };
    build_logger(&cfg.logger);

    tracing::debug!(config = cfg.as_value(), "Configuration loaded successfully");
    let db = scylla::db::DB::new(cfg.scylla)
        .await
        .expect("Failed to connect to ScyllaDB");
    let repo = Arc::new(db);
    let handler = web::Data::new(Handler::new(Arc::clone(&repo)));

    HttpServer::new(move || {
        App::new()
            .app_data(handler.clone())
            .service(
                web::scope("/health")
                    .route(
                        "/readyz",
                        web::get().to(|handler: web::Data<Handler<Arc<DB>>>| async move {
                            handler.readyz().await
                        }),
                    )
                    .route(
                        "/livez",
                        web::get().to(|handler: web::Data<Handler<Arc<DB>>>| async move {
                            handler.livez().await
                        }),
                    ),
            )
            .service(web::scope("/api").service(web::scope("/v1").route(
                "/shorten",
                web::post().to(
                    |handler: web::Data<Handler<Arc<DB>>>, req: actix_web::HttpRequest, info: web::Json<walnuk::handler::handlers::ShortenParams>| async move {
                        handler.shorten(req, info).await
                    },
                ),
            )
            .service(
                web::scope("/admin").service(
                    web::scope("/links")
                        .route(
                            "",
                            web::get().to(
                                |handler: web::Data<Handler<Arc<DB>>>, query| async move {
                                    handler.admin_list_links(query).await
                                },
                            ),
                        )
                        .route(
                            "/{id}/accesses",
                            web::get().to(
                                |handler: web::Data<Handler<Arc<DB>>>, path, query| async move {
                                    handler.admin_list_access_logs(path, query).await
                                },
                            ),
                        )
                        .route(
                            "/{id}",
                            web::get().to(
                                |handler: web::Data<Handler<Arc<DB>>>, path| async move {
                                    handler.admin_get_link(path).await
                                },
                            ),
                        )
                        .route(
                            "/{id}/disable",
                            web::post().to(
                                |handler: web::Data<Handler<Arc<DB>>>, path| async move {
                                    handler.admin_disable(path).await
                                },
                            ),
                        )
                        .route(
                            "/{id}/restore",
                            web::post().to(
                                |handler: web::Data<Handler<Arc<DB>>>, path| async move {
                                    handler.admin_restore(path).await
                                },
                            ),
                        ),
                ),
            )))
            .route(
                "/{id}",
                web::get().to(
                    |handler: web::Data<Handler<Arc<DB>>>, req: actix_web::HttpRequest, path: web::Path<String>| async move {
                        handler.redirect(req, path).await
                    },
                ),
            )
    })
    .bind(("0.0.0.0", cfg.handler.port))?
    .run()
    .await
}
