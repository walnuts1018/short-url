use crate::domain::{error::DomainError, repository::URLRepository};

pub struct Client {}

impl Client {
    pub fn new() -> Self {
        Client {}
    }
}

impl URLRepository for Client {
    async fn save_url(&self, url: &str) -> Result<String, DomainError> {
        // Simulate saving the URL to a database
        println!("Saving URL: {}", url);
        Ok(url.to_string())
    }
}
