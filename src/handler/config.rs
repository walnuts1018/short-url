use envconfig::Envconfig;
use valuable::Valuable;

#[derive(Envconfig, Debug, Valuable, Clone)]
pub struct Config {
    #[envconfig(from = "BASE_URL", default = "http://localhost:8080")]
    pub base_url: String,
    #[envconfig(from = "PORT", default = "8080")]
    pub port: u16,
}
