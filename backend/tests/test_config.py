import os

# Test credentials - loaded from environment or defaults for local testing
TEST_ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@fegrro.pl")
TEST_ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "Admin123!")
