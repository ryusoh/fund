from scripts.utils.security_utils import scrub_secrets
import urllib.parse

def test_scrub_secrets():
    secret1 = "my_secret_123!"
    secret2 = "another_secret"
    secrets = [secret1, None, secret2]

    error_msg = f"Failed to connect: token={secret1} and url_encoded={urllib.parse.quote(secret1)} and plus={urllib.parse.quote_plus(secret1)}"
    error_msg += f" {secret2}"

    scrubbed = scrub_secrets(error_msg, secrets)

    assert secret1 not in scrubbed
    assert urllib.parse.quote(secret1) not in scrubbed
    assert urllib.parse.quote_plus(secret1) not in scrubbed
    assert secret2 not in scrubbed

    assert scrubbed == "Failed to connect: token=*** and url_encoded=*** and plus=*** ***"
