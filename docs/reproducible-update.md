# FCboard 可复现更新

`./update.sh [提交或标签]` 默认使用最新的 `origin/custom`，只接受快进更新。部署使用仓库里与目标提交匹配的 `composer.lock`。如果按发布产物交付锁文件，也可以通过 `FCBOARD_COMPOSER_LOCK` 指定其路径。脚本在临时目录验证锁文件、安装依赖并检查 PHP 扩展，校验成功后才更新代码。

`FCBOARD_COMPOSER` 可指定已安装的 Composer 命令或 PHAR 路径。`FCBOARD_RELOAD_COMMAND` 可接入服务器现有的 Web 和队列进程管理方式，`FCBOARD_HEALTH_URL` 可配置重载后检查的接口。未配置重载命令时，由部署环境重载进程。

迁移至 Laravel 13 的发布要求 PHP 8.3 或以上。更新前核对 Web、命令行及队列进程的 PHP 版本和扩展，并备份数据库。数据库迁移失败后先检查迁移记录和日志，根据迁移是否可逆选择恢复路径。成功更新前的提交会写入部署输出，迁移失败时脚本保留上一个 vendor 目录。

## 维护依赖

在开发或测试环境修改依赖约束后运行 `composer update`，再运行 `composer audit --locked` 和 `composer check-platform-reqs`。使用与生产部署一致的 PHP 版本测试。

运行测试前可以为本次进程单独生成测试密钥，现有实例的 `APP_KEY` 不应随框架升级重新生成。

```bash
APP_KEY="base64:$(php -r 'echo base64_encode(random_bytes(32));')" vendor/bin/phpunit
```
