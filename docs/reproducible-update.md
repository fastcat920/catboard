# FCboard 可复现更新

`./update.sh [提交或标签]` 默认使用最新的 `origin/custom`，只接受快进更新。部署前准备与目标提交匹配并经过审核的 `composer.lock`。锁文件可以随发布提交提供，也可以通过 `FCBOARD_COMPOSER_LOCK` 指向发布产物。脚本在临时目录验证锁文件、安装依赖并检查 PHP 扩展，校验成功后才更新代码。

`FCBOARD_COMPOSER` 可指定已安装的 Composer 命令或 PHAR 路径。`FCBOARD_RELOAD_COMMAND` 可接入服务器现有的 Web 和队列进程管理方式，`FCBOARD_HEALTH_URL` 可配置重载后检查的接口。未配置重载命令时，由部署环境重载进程。

更新前备份数据库。数据库迁移失败后先检查迁移记录和日志，根据迁移是否可逆选择恢复路径。成功更新前的提交会写入部署输出，迁移失败时脚本保留上一个 vendor 目录。
