use envconfig::Envconfig;
use valuable::Valuable;

#[derive(Envconfig, Debug, Valuable)]
pub struct Config {
    #[envconfig(from = "POSTGRES_DSN")]
    pub dsn: String,
}
