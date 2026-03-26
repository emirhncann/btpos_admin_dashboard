<?php
require_once __DIR__ . '/../config/db.php';

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Routing\RouteCollectorProxy;

return function ($app) {
    // Kullanıcı listesi endpoint'i
    $app->get('/user/list', function (Request $request, Response $response) {
        try {
            // Veritabanı bağlantısını aç
            $db = getDBConnection();

            // Kullanıcıları çek
            $stmt = $db->query("SELECT id, name, surname, phone, email, created_by FROM users");
            $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Kullanıcı listesini JSON olarak döndür
            $response->getBody()->write(json_encode([
                "status" => "success",
                "message" => "Kullanıcı listesi getirildi.",
                "users" => $users
            ], JSON_UNESCAPED_UNICODE));

            return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
        } catch (Exception $e) {
            $response->getBody()->write(json_encode([
                "status" => "error",
                "message" => "Sunucu hatası: " . $e->getMessage()
            ]));

            return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
        }
    });
// Müşteri işlemleri grubu
$app->group('/api/customers-add', function (RouteCollectorProxy $group) {
    $group->post('', function (Request $request, Response $response) {
        try {
            // JSON verisini oku
            $input = $request->getBody()->getContents();
            $data = json_decode($input, true);

            // JSON ayrıştırma hatası kontrolü
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception('Gönderilen JSON hatalıdır: ' . json_last_error_msg());
            }

            // Zorunlu alanları kontrol et
            if (empty($data['c_no']) || empty($data['c_name'])) {
                throw new Exception('Müşteri no ve adı zorunludur');
            }

            $db = getDBConnection();

            // Müşteri numarasının benzersiz olup olmadığını kontrol et
            $stmt = $db->prepare("SELECT c_no FROM customer WHERE c_no = ?");
            $stmt->execute([$data['c_no']]);
            if ($stmt->fetch()) {
                throw new Exception('Bu müşteri numarası zaten kullanılıyor');
            }

            // Yeni müşteri ekle
            $sql = "INSERT INTO customer 
                    (c_no, c_name, c_email, c_phone, active, created_date, created_by)
                    VALUES (?, ?, ?, ?, ?, NOW(), 'system')";

            $stmt = $db->prepare($sql);
            $result = $stmt->execute([
                $data['c_no'],
                $data['c_name'],
                $data['c_email'] ?? null,
                $data['c_phone'] ?? null,
                $data['active'] ?? 1
            ]);

            if ($result) {
                $response->getBody()->write(json_encode([
                    'success' => true,
                    'message' => 'Müşteri başarıyla eklendi',
                    'customer' => [
                        'c_no' => $data['c_no'],
                        'c_name' => $data['c_name'],
                        'c_email' => $data['c_email'] ?? null,
                        'c_phone' => $data['c_phone'] ?? null,
                        'active' => $data['active'] ?? 1
                    ]
                ], JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')->withStatus(201);
            } else {
                throw new Exception('Müşteri eklenirken bir hata oluştu');
            }

        } catch (Exception $e) {
            $response->getBody()->write(json_encode([
                'success' => false,
                'message' => $e->getMessage()
            ], JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
        }
    });
});
// Şube işlemleri grubu
$app->group('/api/branches', function (RouteCollectorProxy $group) {
    // Şube ekleme endpoint'i
    $group->post('', function (Request $request, Response $response) {
       try {
        // JSON Verisini Manuel Olarak Okuma
        $input = $request->getBody()->getContents();
        $data = json_decode($input, true);

        // JSON ayrıştırma hatası kontrolü
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new Exception('Gönderilen JSON hatalıdır: ' . json_last_error_msg());
        }

        // Veritabanı bağlantısını al
        $db = getDBConnection();

        // Zorunlu alanları kontrol et
        if (empty($data['name']) || empty($data['customer_ref'])) {
            throw new Exception('Şube adı ve müşteri seçimi zorunludur');
        }

        // Müşterinin var olup olmadığını kontrol et
        $stmt = $db->prepare("SELECT id FROM customer WHERE id = ?");
        $stmt->execute([$data['customer_ref']]);
        if (!$stmt->fetch()) {
            throw new Exception('Seçilen müşteri bulunamadı');
        }

        // Yeni şube ekle
        $sql = "INSERT INTO branch 
                (name, customer_ref, active, created_date)
                VALUES (?, ?, ?, NOW())";

        $stmt = $db->prepare($sql);
        $result = $stmt->execute([
            $data['name'],
            $data['customer_ref'],
            $data['active'] ?? 1
        ]);

        if ($result) {
            $response->getBody()->write(json_encode([
                'success' => true,
                'message' => 'Şube başarıyla eklendi',
                'branch' => [
                    'name' => $data['name'],
                    'customer_ref' => $data['customer_ref'],
                    'active' => $data['active'] ?? 1
                ]
            ], JSON_UNESCAPED_UNICODE));
            return $response
                ->withHeader('Content-Type', 'application/json')
                ->withStatus(201);
        } else {
            throw new Exception('Şube eklenirken bir hata oluştu');
        }
    } catch (Exception $e) {
        $response->getBody()->write(json_encode([
            'success' => false,
            'message' => $e->getMessage()
        ], JSON_UNESCAPED_UNICODE));
        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus(400);
    }
    });
});
 
   $app->group('/api/categories', function (RouteCollectorProxy $group) {
    
    // Kategori listesi
    $group->get('', function (Request $request, Response $response) {
        try {
            $db = getDBConnection();
            $stmt = $db->query("SELECT * FROM category ORDER BY name");
            $categories = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $response->getBody()->write(json_encode([
                'success' => true,
                'categories' => $categories
            ], JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
        } catch (Exception $e) {
            return errorResponse($response, $e);
        }
    });

    // Kategori ekleme
    $group->post('', function (Request $request, Response $response) {
        try {
            $input = json_decode($request->getBody()->getContents(), true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception('Gönderilen JSON hatalı: ' . json_last_error_msg());
            }

            if (empty($input['name'])) {
                throw new Exception('Kategori adı zorunludur');
            }

            $db = getDBConnection();

            // Aynı isimde kategori var mı kontrol et
            $stmt = $db->prepare("SELECT id FROM category WHERE name = ?");
            $stmt->execute([$input['name']]);
            if ($stmt->fetch()) {
                throw new Exception('Bu isimde bir kategori zaten var');
            }

            $sql = "INSERT INTO category (name, active, created_date) VALUES (?, ?, NOW())";
            $stmt = $db->prepare($sql);
            $result = $stmt->execute([
                $input['name'],
                $input['active'] ?? 1
            ]);

            if ($result) {
                return successResponse($response, 'Kategori başarıyla eklendi', 201);
            } else {
                throw new Exception('Kategori eklenirken bir hata oluştu');
            }
        } catch (Exception $e) {
            return errorResponse($response, $e);
        }
    });

    // Kategori güncelleme
    $group->put('/{id}', function (Request $request, Response $response, array $args) {
        try {
            $id = $args['id'];
            $input = json_decode($request->getBody()->getContents(), true);

            if (empty($input['name'])) {
                throw new Exception('Kategori adı zorunludur');
            }

            $db = getDBConnection();

            // Kategori var mı kontrol et
            $stmt = $db->prepare("SELECT id FROM category WHERE id = ?");
            $stmt->execute([$id]);
            if (!$stmt->fetch()) {
                throw new Exception('Kategori bulunamadı');
            }

            $sql = "UPDATE category SET name = ?, active = ?, update_date = NOW() WHERE id = ?";
            $stmt = $db->prepare($sql);
            $result = $stmt->execute([
                $input['name'],
                $input['active'] ?? 1,
                $id
            ]);

            if ($result) {
                return successResponse($response, 'Kategori başarıyla güncellendi');
            } else {
                throw new Exception('Kategori güncellenirken bir hata oluştu');
            }
        } catch (Exception $e) {
            return errorResponse($response, $e);
        }
    });

    // Kategori silme
    $group->delete('/{id}', function (Request $request, Response $response, array $args) {
        try {
            $id = $args['id'];
            $db = getDBConnection();

            // Alt kategorileri kontrol et
            $stmt = $db->prepare("SELECT id FROM sub_category WHERE category_ref = ?");
            $stmt->execute([$id]);
            if ($stmt->fetch()) {
                throw new Exception('Bu kategoriye bağlı alt kategoriler var. Önce alt kategorileri silmelisiniz.');
            }

            $sql = "DELETE FROM category WHERE id = ?";
            $stmt = $db->prepare($sql);
            $result = $stmt->execute([$id]);

            if ($result) {
                return successResponse($response, 'Kategori başarıyla silindi');
            } else {
                throw new Exception('Kategori silinirken bir hata oluştu');
            }
        } catch (Exception $e) {
            return errorResponse($response, $e);
        }
    });
});

// Alt kategori işlemleri
$app->group('/api/sub-categories', function (RouteCollectorProxy $group) {

    // Alt kategori listesi
    $group->get('', function (Request $request, Response $response) {
        try {
            $db = getDBConnection();
            $sql = "SELECT s.*, c.name as category_name 
                    FROM sub_category s 
                    LEFT JOIN category c ON s.category_ref = c.id 
                    ORDER BY s.name";
            $stmt = $db->query($sql);
            $subCategories = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $response->getBody()->write(json_encode([
                'success' => true,
                'sub_categories' => $subCategories
            ], JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
        } catch (Exception $e) {
            return errorResponse($response, $e);
        }
    });

    // Alt kategori ekleme
    $group->post('', function (Request $request, Response $response) {
        try {
            $input = json_decode($request->getBody()->getContents(), true);

            if (empty($input['name']) || empty($input['category_ref'])) {
                throw new Exception('Alt kategori adı ve kategori seçimi zorunludur');
            }

            $db = getDBConnection();

            $sql = "INSERT INTO sub_category (name, category_ref, active, created_date) VALUES (?, ?, ?, NOW())";
            $stmt = $db->prepare($sql);
            $result = $stmt->execute([
                $input['name'],
                $input['category_ref'],
                $input['active'] ?? 1
            ]);

            if ($result) {
                return successResponse($response, 'Alt kategori başarıyla eklendi', 201);
            } else {
                throw new Exception('Alt kategori eklenirken bir hata oluştu');
            }
        } catch (Exception $e) {
            return errorResponse($response, $e);
        }
    });
});

// Başarılı yanıt fonksiyonu
function successResponse(Response $response, string $message, int $status = 200) {
    $response->getBody()->write(json_encode([
        'success' => true,
        'message' => $message
    ], JSON_UNESCAPED_UNICODE));
    return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
}

// Hata yanıt fonksiyonu
function errorResponse(Response $response, Exception $e, int $status = 400) {
    $response->getBody()->write(json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE));
    return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
}

};
