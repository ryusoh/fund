"""Cross-layer shared environment-variable name constants.

This module centrally defines the environment-variable names referenced by
multiple layers (CLI, Service, Domain), avoiding the same string being
hardcoded in several places.
"""

SEC_USER_AGENT_ENV = "SEC_USER_AGENT"
"""Environment variable name for the User-Agent used in SEC download requests."""

TAVILY_API_KEY_ENV = "TAVILY_API_KEY"
"""Environment variable name for the Tavily web-search API key."""

SERPER_API_KEY_ENV = "SERPER_API_KEY"
"""Environment variable name for the Serper web-search API key."""

FMP_API_KEY_ENV = "FMP_API_KEY"
"""Environment variable name for the Financial Modeling Prep API key."""

FINS_PROCESSOR_PROFILE_ENV = "FINS_PROCESSOR_PROFILE"
"""Environment variable name for the processor performance-profiling switch."""
