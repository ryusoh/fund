
2024-03-08 - [Insecure API Keys Transmission], Insecure HTTP API Transmission, Transmitting secret API keys via HTTP allows MITM attacks. Always utilize HTTPS endpoints for external APIs. Mocks using `urllib.request.Request` were successfully employed to verify scheme usage (e.g. `mock_request.call_args[0][0].startswith("https://")`).
