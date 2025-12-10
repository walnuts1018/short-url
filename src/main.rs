use actix_web::{App, HttpServer, web};
use short_url::{
    config::{self, logger::LoggerConfig},
    handler::handlers::Handler,
};
use tracing_subscriber::fmt::time::ChronoLocal;
use valuable::Valuable;

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

    HttpServer::new(move || {
        App::new()
            .app_data(Handler::new(cfg.handler.clone()))
            .route(
                "/readyz",
                web::get().to(|handler: web::Data<Handler>| async move { handler.readyz().await }),
            )
            .route(
                "/livez",
                web::get().to(|handler: web::Data<Handler>| async move { handler.livez().await }),
            )
            .service(web::scope("/api").service(web::scope("/v1").route(
                "/shorten",
                web::post().to(|handler: web::Data<Handler>, info| async move {
                    handler.shorten(info).await
                }),
            )))
    })
    .run()
    .await
}
