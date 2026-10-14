import json
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
SOURCE = ROOT / "src" / "dynamic-energy-price-card.js"
DIST = ROOT / "dist" / "eleven-dynamic-energy-price-card.js"


class HacsPackageTests(unittest.TestCase):
    def test_hacs_dashboard_package_is_standalone(self):
        hacs = json.loads((ROOT / "hacs.json").read_text(encoding="utf-8"))
        self.assertEqual(hacs["name"], "Eleven Dynamic Energy Price Card")
        self.assertEqual(hacs["filename"], "eleven-dynamic-energy-price-card.js")
        self.assertTrue(hacs["render_readme"])
        self.assertTrue(SOURCE.is_file())
        self.assertTrue(DIST.is_file())
        self.assertEqual(list((ROOT / "dist").glob("*.js")), [DIST])

        bundled = DIST.read_text(encoding="utf-8")
        self.assertNotIn("from './price-utils.js'", bundled)
        self.assertNotIn("export function", bundled)
        self.assertIn("static getConfigForm(config)", bundled)
        self.assertIn("computeHelper:", bundled)
        self.assertIn("customElements.define('eleven-dynamic-energy-price-card'", bundled)

    def test_python_custom_integration_is_not_part_of_hacs_package(self):
        self.assertFalse((ROOT / "custom_components").exists())


if __name__ == "__main__":
    unittest.main()
