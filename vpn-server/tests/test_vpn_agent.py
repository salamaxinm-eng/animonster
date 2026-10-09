import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'deploy/vpn-agent.py'
SPEC = importlib.util.spec_from_file_location('vpn_agent', SOURCE)
agent = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(agent)


class VpnAgentTests(unittest.TestCase):
    def test_render_and_reconcile_are_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            agent.BASE_AWG = root / 'base-awg.conf'
            agent.BASE_XRAY = root / 'base-xray.json'
            agent.AWG = root / 'awg.conf'
            agent.XRAY = root / 'xray.json'
            agent.COMPOSE = root / 'compose.yaml'
            base_awg = '[Interface]\nPrivateKey = server\n\n[Peer]\nPublicKey = pilot\n'
            base_xray = {'inbounds': [{'settings': {'users': [{'id': 'pilot'}]}}]}
            agent.BASE_AWG.write_text(base_awg)
            agent.AWG.write_text(base_awg)
            agent.BASE_XRAY.write_text(json.dumps(base_xray))
            agent.XRAY.write_text(json.dumps(base_xray))
            calls = []
            original_run = agent.run
            original_write = agent.atomic_write
            try:
                agent.run = lambda *args, **kwargs: calls.append(args)
                agent.atomic_write = lambda path, content, owner=None: path.write_text(content)
                state = {'device-1': {'slot': 3, 'awg_public': 'public',
                                      'awg_psk': 'psk', 'xray_uuid': 'uuid'}}
                agent.reconcile(state)
                self.assertIn('AllowedIPs = 10.88.0.3/32', agent.AWG.read_text())
                self.assertEqual(json.loads(agent.XRAY.read_text())['inbounds'][0]['settings']['users'],
                                 [{'id': 'pilot'}, {'id': 'uuid', 'flow': 'xtls-rprx-vision',
                                                   'email': 'device-1@vpn.animonster.su'}])
                count = len(calls)
                agent.reconcile(state)
                self.assertEqual(len(calls), count)
                agent.reconcile({})
                self.assertNotIn('managed:device-1', agent.AWG.read_text())
                self.assertEqual(len(json.loads(agent.XRAY.read_text())['inbounds'][0]['settings']['users']), 1)
            finally:
                agent.run = original_run
                agent.atomic_write = original_write


if __name__ == '__main__':
    unittest.main()
