use envconfig::Envconfig;
use strum::EnumString;
use valuable::Valuable;

#[derive(EnumString, Debug, Valuable)]
#[strum(ascii_case_insensitive)]
pub enum LogFormat {
    Json,
    Text,
}

#[derive(Envconfig, Debug, Valuable)]
pub struct LoggerConfig {
    #[envconfig(from = "RUST_LOG_FORMAT", default = "json")]
    pub format: LogFormat,
}
