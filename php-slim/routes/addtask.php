<?php
require_once __DIR__ . '/../config/db.php';

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

return function ($app) {
    $app->group('/addtask', function ($group) {
        
        // ✅ Tüm Müşterileri Çek (id, c_name)
      $group->get('/customers', function (Request $request, Response $response) {
    $db = getDBConnection();
    $stmt = $db->query("SELECT id, c_name, c_no
FROM customer 
WHERE active = 0 
ORDER BY id ASC;
");
    $customers = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $response->getBody()->write(json_encode($customers, JSON_UNESCAPED_UNICODE));
   return $response->withHeader('Content-Type', 'application/json; charset=utf-8')->withStatus(200);

});


        // ✅ Belirli Bir Müşteriye Ait Şubeleri Getir (id, name)
        $group->get('/branch/{id}', function (Request $request, Response $response, array $args) {
            $customerId = $args['id'];
            $db = getDBConnection();
           $stmt = $db->prepare("SELECT id, name FROM branch WHERE customer_ref = ? ORDER BY name ASC");
            $stmt->execute([$customerId]);
            $branches = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $response->getBody()->write(json_encode($branches, JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
        });

        // ✅ Tüm Kategorileri Getir (type = 'destek' veya 'urun')
        $group->get('/category', function (Request $request, Response $response) {
            try {
                $type = $request->getQueryParams()['type'] ?? 'destek'; // Varsayılan olarak 'destek'

                $db = getDBConnection();
                $stmt = $db->prepare("SELECT * 
FROM category 
WHERE type = ? AND active = 1 
ORDER BY name ASC;
");
                $stmt->execute([$type]);

                $categories = $stmt->fetchAll(PDO::FETCH_ASSOC);

                $response->getBody()->write(json_encode($categories, JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
            } catch (Exception $e) {
                $response->getBody()->write(json_encode(["status" => "error", "message" => $e->getMessage()]));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
            }
        });

        // ✅ Belirli Bir Kategoriye Bağlı Alt Kategorileri Getir (id, name)
        $group->get('/sub_category/{category_id}', function (Request $request, Response $response, array $args) {
            $categoryId = $args['category_id'];
            $db = getDBConnection();
            $stmt = $db->prepare("SELECT id, name FROM sub_category WHERE category_ref = ? ORDER BY name ASC");
            $stmt->execute([$categoryId]);
            $subCategories = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $response->getBody()->write(json_encode($subCategories, JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
        });

      // ✅ Görevi Transfer Et (status = 1 olarak güncellendi ve transfer_log kaydı eklendi)
$group->put('/transfer/{task_id}', function (Request $request, Response $response, array $args) {
    try {
        // Task ID'yi al
        $taskId = $args['task_id'];

        // JSON formatında gelen isteği al
        $contentType = $request->getHeaderLine('Content-Type');
        if (strpos($contentType, 'application/json') !== false) {
            $data = json_decode($request->getBody()->getContents(), true);
        } else {
            $data = $request->getParsedBody();
        }

        // Gerekli parametreleri al
        $newUserId = $data['user_ref'] ?? null;
        $currentUserId = $data['update_user_ref'] ?? null;
        $transferDescription = $data['transferDescription'] ?? ''; // ✅ Yeni alan eklendi

        if (empty($newUserId) || empty($currentUserId)) {
            $response->getBody()->write(json_encode([
                "status" => "error",
                "message" => "Eksik parametreler!"
            ]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
        }

        // Veritabanı bağlantısını aç
        $db = getDBConnection();

        // Mevcut görevin eski kullanıcı bilgisini al
        $stmt = $db->prepare("SELECT user_ref FROM tasks WHERE id = ?");
        $stmt->execute([$taskId]);
        $oldUser = $stmt->fetchColumn();

        if (!$oldUser) {
            $response->getBody()->write(json_encode([
                "status" => "error",
                "message" => "Görev bulunamadı!"
            ]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
        }

        // Görevi yeni kullanıcıya ata, status = 1 yap ve güncelleme bilgilerini kaydet
        $stmt = $db->prepare("
            UPDATE tasks 
            SET user_ref = ?, 
                update_user_ref = ?, 
                update_date = NOW(),
                status = 1
            WHERE id = ?
        ");
        $success = $stmt->execute([$newUserId, $currentUserId, $taskId]);

        if ($success) {
            // ✅ Transfer Log Tablosuna Kayıt Ekle
            $stmt = $db->prepare("
                INSERT INTO transfer_log (task_ref, from_user, to_user, transfer_date, description)
                VALUES (?, ?, ?, NOW(), ?)
            ");
            $stmt->execute([$taskId, $oldUser, $newUserId, $transferDescription]); // ✅ Hata düzeltildi

            $response->getBody()->write(json_encode([
                "status" => "success",
                "message" => "Görev başarıyla transfer edildi ve bekliyor durumuna getirildi."
            ]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
        } else {
            throw new Exception("Veritabanı hatası.");
        }
    } catch (Exception $e) {
        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => "Sunucu hatası: " . $e->getMessage()
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
    }
});



    });
};
