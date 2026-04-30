import unittest
from unittest.mock import MagicMock, patch
import sys
import types

functions_framework = types.ModuleType("functions_framework")
functions_framework.http = lambda fn: fn
sys.modules["functions_framework"] = functions_framework

secretmanager = types.ModuleType("google.cloud.secretmanager")
secretmanager.SecretManagerServiceClient = MagicMock
sys.modules["google.cloud.secretmanager"] = secretmanager

with patch("google.cloud.firestore.Client", return_value=MagicMock()):
    import main


class SourceNormalizationTest(unittest.TestCase):
    def test_normalizes_common_aliases(self):
        self.assertEqual(main._normalize_lead_source("FB Lead"), "Meta Ads")
        self.assertEqual(main._normalize_lead_source("Instagram Ads"), "Meta Ads")
        self.assertEqual(main._normalize_lead_source("Google Adwords"), "Google Ads")
        self.assertEqual(main._normalize_lead_source("Landing Page"), "Website")
        self.assertEqual(main._normalize_lead_source("CP Referral"), "Channel Partner")
        self.assertEqual(main._normalize_lead_source("site-walk-in"), "Walk-in")

    def test_preserves_unknown_sources(self):
        self.assertEqual(main._normalize_lead_source("  Magicbricks  "), "Magicbricks")
        self.assertEqual(main._normalize_lead_source(""), "Unknown")


if __name__ == "__main__":
    unittest.main()
