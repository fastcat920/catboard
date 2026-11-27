<?php

namespace App\Console\Commands;

use App\Services\FastCatAutoGrants;
use App\Services\ServerService;
use Illuminate\Console\Command;
use RuntimeException;

class FastCatAutoGrant extends Command
{
    protected $signature = 'fastcat:auto {action : grant, revoke, or export} {node : Panel type:id} {user? : Numeric account ID} {--out= : New private export directory} {--device= : Gateway device record ID for a v2 grant}';
    protected $description = 'Manage separate HTTP/2 and HTTPS credentials for a FastCat account and node';

    public function handle(ServerService $service)
    {
        $key = $this->argument('node');
        $action = $this->argument('action');
        $id = $this->argument('user');
        $device = $this->option('device');
        if ($device !== null && ($action === 'export' || !preg_match('/^dev_[a-f0-9]{24}$/D', $device))) {
            $this->error('Invalid gateway device record ID.');
            return 1;
        }
        $base = config('fastcat.auto_grants_dir', '');
        if (!$base || !in_array($action, ['grant', 'revoke', 'export'], true) ||
            !preg_match('/^(anytls|hysteria|shadowsocks|trojan|tuic|v2node|vless|vmess):([1-9][0-9]*)$/D', $key, $m) ||
            ($action === 'export' ? ($id !== null || !$this->option('out')) : !preg_match('/^[1-9][0-9]*$/D', (string)$id))) {
            $this->error('Set FASTCAT_AUTO_GRANTS_DIR and supply a valid action, node and arguments.');
            return 1;
        }
        $root = $base . '/' . $key;
        if (!is_dir($root)) {
            $this->error('Set up the private node directory first.');
            return 1;
        }
        $mask = umask(0077);
        $lock = null;
        try {
            $lock = fopen($root . '/.lock', 'c');
            if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Could not lock the node.');
            $grants = $root . '/grants';
            if (!is_dir($grants) && !mkdir($grants, 0700)) throw new RuntimeException('Could not create the grants directory.');
            $file = $grants . '/' . $id . ($device === null ? '' : '.' . $device) . '.json';
            if ($action === 'revoke') {
                if (file_exists($file) && !unlink($file)) throw new RuntimeException('Could not remove the grant.');
            } else {
                $server = $service->getServer((int)$m[2], $m[1]);
                $eligible = [];
                if ($server && $server['show']) {
                    foreach ($service->getAvailableUsers($server['group_id']) as $user) {
                        $eligible[(int)$user['id']] = true;
                    }
                }
                if ($action === 'grant') {
                    if (!isset($eligible[$id])) throw new RuntimeException('Account does not currently qualify for this node.');
                    if (!FastCatAutoGrants::endpoints($root, $device !== null)) throw new RuntimeException('Set up valid node endpoints first.');
                    if (!is_file($file)) {
                        self::writePrivate($file, json_encode([
                            'token' => bin2hex(random_bytes(32)),
                            ($device === null ? 'fallback-token' : 'h3-token') => bin2hex(random_bytes(32)),
                        ]) . "\n");
                    }
                    if (!FastCatAutoGrants::lookup($root, (int)$id, $device)) throw new RuntimeException('Check the node endpoints and credential record.');
                } else {
                    $this->export($root, $eligible, $this->option('out'));
                }
            }
            $this->info($action === 'export' ? 'Snapshot ready.' : 'Grant updated. Export and synchronize both entry services.');
            return 0;
        } catch (RuntimeException $error) {
            $this->error($error->getMessage());
            return 1;
        } finally {
            if (is_resource($lock)) fclose($lock);
            umask($mask);
        }
    }

    private function export(string $root, array $eligible, string $out): void
    {
        $lists = ['h2.tokens' => [], 'v1.tokens' => [], 'h3.tokens' => []];
        $files = glob($root . '/grants/*.json');
        if ($files === false) throw new RuntimeException('Cannot enumerate the grants.');
        foreach ($files as $file) {
            $name = basename($file, '.json');
            if (!preg_match('/^([1-9][0-9]*)(?:\.(dev_[a-f0-9]{24}))?$/D', $name, $m)) {
                throw new RuntimeException('Unexpected grant filename.');
            }
            $id = (int)$m[1];
            if (!isset($eligible[$id])) continue;
            $device = $m[2] ?? null;
            $node = FastCatAutoGrants::lookup($root, $id, $device);
            if (!$node) throw new RuntimeException('A current grant or endpoint record is invalid.');
            $lists['h2.tokens'][] = $node['token'];
            if ($device === null) {
                $lists['v1.tokens'][] = $node['fallback-token'];
            } else {
                $lists['h3.tokens'][] = $node['h3-token'];
            }
        }
        if (file_exists($out) || is_link($out)) throw new RuntimeException('Export requires a new snapshot path.');
        $tmp = dirname($out) . '/.fastcat-export-' . bin2hex(random_bytes(10));
        if (!mkdir($tmp, 0700)) throw new RuntimeException('Cannot create snapshot directory.');
        try {
            foreach ($lists as $name => $tokens) {
                self::writePrivate($tmp . '/' . $name, $tokens ? implode("\n", $tokens) . "\n" : '');
            }
            if (!rename($tmp, $out)) throw new RuntimeException('Cannot publish snapshot.');
        } finally {
            if (is_dir($tmp)) {
                foreach (array_keys($lists) as $name) if (is_file($tmp . '/' . $name)) unlink($tmp . '/' . $name);
                rmdir($tmp);
            }
        }
    }

    private static function writePrivate(string $path, string $data): void
    {
        $tmp = tempnam(dirname($path), '.fastcat-');
        if ($tmp === false) throw new RuntimeException('Could not create a private file.');
        try {
            if (file_put_contents($tmp, $data) !== strlen($data) || !rename($tmp, $path)) {
                throw new RuntimeException('Could not save the private file.');
            }
        } finally {
            if (is_file($tmp)) unlink($tmp);
        }
    }
}
