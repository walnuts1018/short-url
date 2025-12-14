use envconfig::Envconfig;
use valuable::Valuable;

#[derive(Envconfig, Debug, Valuable, Clone)]
pub struct Config {
    #[envconfig(from = "SCYLLA_URL")]
    pub url: String,

    #[envconfig(from = "SCYLLA_USER", default = "cassandra")]
    pub user: String,

    #[envconfig(from = "SCYLLA_PASSWORD", default = "cassandra")]
    pub password: String,

    #[envconfig(from = "SCYLLA_KEYSPACE", default = "walnuk")]
    pub keyspace: String,

    #[envconfig(from = "SCYLLA_CA_CERT_PATH")]
    pub ca_cert_path: Option<String>,

    #[envconfig(from = "SCYLLA_CLIENT_CERT_PATH")]
    pub client_cert_path: Option<String>,

    #[envconfig(from = "SCYLLA_CLIENT_KEY_PATH")]
    pub client_key_path: Option<String>,
}
