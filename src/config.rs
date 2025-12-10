pub mod logger;

use crate::{config::logger::LoggerConfig, handler, postgres};
use envconfig::Envconfig;
use valuable::Valuable;

#[derive(Envconfig, Debug, Valuable)]
pub struct Config {
    #[envconfig(nested)]
    pub handler: handler::config::Config,
    #[envconfig(nested)]
    pub postgres: postgres::config::Config,
    #[envconfig(nested)]
    pub logger: LoggerConfig,
}

pub fn load() -> Result<Config, envconfig::Error> {
    Config::init_from_env()
}
