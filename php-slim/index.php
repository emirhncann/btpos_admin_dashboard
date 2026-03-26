<?php
require 'vendor/autoload.php';
require 'config/db.php';

use Slim\Factory\AppFactory;

$app = AppFactory::create();

$corsMiddleware = require __DIR__ . '/middleware/cors.php';
$app->add($corsMiddleware);

$app->addRoutingMiddleware();
$app->addErrorMiddleware(true, true, true);

(require __DIR__ . '/routes/login.php')($app);
(require __DIR__ . '/routes/user.php')($app);
(require __DIR__ . '/routes/task.php')($app);
(require __DIR__ . '/routes/addtask.php')($app);
(require __DIR__ . '/routes/tasknote.php')($app);
(require __DIR__ . '/routes/contract.php')($app);
(require __DIR__ . '/routes/netgsm.php')($app);

$app->run();
