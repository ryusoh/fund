import urllib.parse


def scrub_secrets(error_msg: str, secrets: list[str]) -> str:
    """Scrub sensitive information from error messages."""
    for secret in secrets:
        if secret:
            error_msg = error_msg.replace(secret, "***")
            error_msg = error_msg.replace(urllib.parse.quote(secret), "***")
            error_msg = error_msg.replace(urllib.parse.quote_plus(secret), "***")
    return error_msg
