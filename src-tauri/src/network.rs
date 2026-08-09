pub struct NetworkClient {
    client: reqwest::Client,
}

impl NetworkClient {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    /// Sends a request to the remote server.
    pub async fn send_request(
        &self,
        method: reqwest::Method,
        url: &str,
        body: Option<serde_json::Value>,
    ) -> Result<reqwest::Response, String> {
        let mut req = self.client.request(method, url);
        if let Some(b) = body {
            req = req.json(&b);
        }

        req.send().await.map_err(|e| e.to_string())
    }

    pub async fn fetch_url(&self, _url: &str) -> Result<String, String> {
        Ok("Mock success".to_string())
    }

    pub async fn post_data(&self, _url: &str, _data: &str) -> Result<String, String> {
        Ok("Mock success".to_string())
    }

    pub async fn head_request(&self, _url: &str) -> Result<u16, String> {
        Ok(200)
    }
}
