use super::error::DomainError;

#[trait_variant::make(IntFactory: Send)]
pub trait URLRepository {
    async fn save_url(&self, url: &str) -> Result<String, DomainError>;
}
