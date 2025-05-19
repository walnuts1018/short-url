use crate::domain::repository::URLRepository;

pub struct Usecase<R: URLRepository> {
    url_repository: R,
}

impl<R: URLRepository> Usecase<R> {
    pub fn new(url_repository: R) -> Self {
        Usecase { url_repository }
    }

    pub async fn test(&self) {
        let url = self
            .url_repository
            .save_url("https://example.com")
            .await
            .unwrap();
        println!("Usecase test URL: {}", url);
    }
}
