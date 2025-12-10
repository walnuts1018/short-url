use actix_web::{
    Either, HttpRequest, HttpResponse, Responder,
    body::BoxBody,
    http::header::ContentType,
    web::{self, Redirect},
};
use serde::{Deserialize, Serialize};

use crate::{domain::repository::URLRepository, handler::config::Config};

#[derive(Clone)]
pub struct Handler<T: URLRepository> {
    config: Config,
    url_repo: T,
}

impl<T: URLRepository> Handler<T> {
    pub fn new(config: Config, url_repo: T) -> Self {
        Handler { config, url_repo }
    }
}

impl<T: URLRepository> Handler<T> {
    pub async fn livez(&self) -> impl Responder + use<T> {
        HttpResponse::Ok().body("Ok")
    }

    pub async fn readyz(&self) -> impl Responder + use<T> {
        HttpResponse::Ok().body("Ok")
    }
}

#[derive(Deserialize)]
pub struct ShortenParams {
    pub url: String,
    pub custom_id: Option<String>,
}

#[derive(Serialize)]
pub struct ShortenResponse {
    pub id: String,
}

impl Responder for ShortenResponse {
    type Body = BoxBody;

    fn respond_to(self, _req: &HttpRequest) -> HttpResponse<Self::Body> {
        match serde_json::to_string(&self) {
            Ok(body) => HttpResponse::Ok()
                .content_type(ContentType::json())
                .body(body),
            Err(_) => HttpResponse::InternalServerError().finish(),
        }
    }
}

impl<T: URLRepository> Handler<T> {
    pub async fn shorten(&self, info: web::Json<ShortenParams>) -> impl Responder + use<T> {
        return match self
            .url_repo
            .create(&info.url, info.custom_id.as_deref(), None)
            .await
        {
            Ok(shortened) => Either::Right(ShortenResponse { id: shortened.id }),
            Err(_) => {
                Either::Left(HttpResponse::InternalServerError().body("Failed to shorten URL"))
            }
        };
    }
}
impl<T: URLRepository> Handler<T> {
    pub async fn redirect(&self, path: web::Path<(String)>) -> impl Responder + use<T> {
        let id = path.into_inner();
        let original_url = match self.url_repo.find_by_id(&id).await {
            Ok(opt) => opt,
            Err(_) => {
                return Either::Left(
                    HttpResponse::InternalServerError().body("Failed to retrieve URL"),
                );
            }
        };

        match original_url {
            Some(url) => Either::Right(Redirect::to(url.original_url.clone()).permanent()),
            None => Either::Left(HttpResponse::NotFound().body("URL not found")),
        }
    }
}
