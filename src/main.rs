use short_url::{infra::postgres::db, usecase::usecase::Usecase};

#[tokio::main]
async fn main() {
    let db_client = db::Client::new();
    let usecase = Usecase::new(db_client);
    usecase.test().await;
}
