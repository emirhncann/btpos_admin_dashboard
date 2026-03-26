<?php
require_once __DIR__ . '/../config/db.php';

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

return function ($app) {
    $app->group('/tasks', function ($group) {

$group->post('/add', function (Request $request, Response $response) {
    try {
        $data = json_decode($request->getBody()->getContents(), true);

        // Gerekli alanları al
        $customerRef = $data['customer_ref'] ?? null;
        $branchRef = $data['branch_ref'] ?? null;
        $type = $data['type'] ?? null;
        $categoryRef = $data['category_ref'] ?? null;
        $subCategoryRef = $data['sub_category_ref'] ?? null;
        $description = $data['description'] ?? null;
        $status = $data['status'] ?? 'Bekliyor';
        $userRef = $data['user_ref'] ?? null;
        $createdBy = $data['created_by'] ?? null;
        $totalTime = $data['total_time'] ?? 0;
        $createdDate = $data['created_date'] ?? date("Y-m-d H:i:s");
        $updateDate = $data['update_date'] ?? date("Y-m-d H:i:s");
        $updateUserRef = $data['update_user_ref'] ?? null;
        $arayan = $data['arayan'] ?? null;
        $details = $data['details'] ?? null;
        $phone = $data['phone'] ?? null;
        $is_planned = $data['is_planned'] ?? 0;
        $planned_date = $data['planned_date'] ?? null;

        // Ürün verilerini al
        $product1 = $data['product_1'] ?? null;
        $product2 = $data['product_2'] ?? null;
        $product3 = $data['product_3'] ?? null;
        $product4 = $data['product_4'] ?? null;
        $product5 = $data['product_5'] ?? null;
        $garanti_durumu = $data['garanti_durumu'] ?? null;

        // Eksik alanları kontrol et
        if (!$customerRef || !$type || !$categoryRef || !$description || !$userRef || !$createdBy) {
            $response->getBody()->write(json_encode([
                "status" => "error",
                "message" => "Eksik alanlar var!"
            ]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
        }

        $db = getDBConnection();

        // contract_status belirle
        $contractStatus = 0;
        $stmtContract = $db->prepare("SELECT status FROM contract WHERE customer_ref = ? LIMIT 1");
        $stmtContract->execute([$customerRef]);
        $contractRow = $stmtContract->fetch(PDO::FETCH_ASSOC);
        if ($contractRow && isset($contractRow['status']) && in_array($contractRow['status'], [0, 1])) {
            $contractStatus = $contractRow['status'];
        }

        // Görev ekle
        $stmt = $db->prepare("
            INSERT INTO tasks 
            (customer_ref, branch_ref, type, category_ref, sub_category_ref, 
            description, status, total_time, user_ref, created_date, 
            created_by, update_date, update_user_ref, arayan, details, phone,
            product_1, product_2, product_3, product_4, product_5, garanti_durumu, 
            is_planned, planned_date, contract_status) 
            VALUES 
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");

        $stmt->execute([
            $customerRef, 
            $branchRef, 
            $type, 
            $categoryRef, 
            $subCategoryRef, 
            $description,
            $status, 
            $totalTime, 
            $userRef, 
            $createdDate, 
            $createdBy,
            $updateDate,
            $updateUserRef,
            $arayan,
            $details,
            $phone,
            $product1,
            $product2,
            $product3,
            $product4,
            $product5,
            $garanti_durumu,
            $is_planned,
            $planned_date,
            $contractStatus
        ]);

        $lastId = $db->lastInsertId(); // <- EKLENDİ

        $response->getBody()->write(json_encode([
            "status" => "success",
            "message" => "Görev başarıyla eklendi!",
            "task_id" => $lastId
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(201);

    } catch (Exception $e) {
        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => "Sunucu hatası: " . $e->getMessage()
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
    }
});




// 🟣 **Tüm Görevleri Getir (GET)**
$group->get('', function (Request $request, Response $response) {
    $db = getDBConnection();

    // Pagination ve parametreleri al
    $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 30;
    $uid = isset($_GET['uid']) ? (int)$_GET['uid'] : null;
    $offset = ($page - 1) * $limit;

    // Sorgu başlangıcı
    $query = "
    SELECT 
        id, 
        description, 
        phone, 
        details,
        status,
        created_date,
        completed_at,
        customer_name, 
        sozlesmeNo,
        branch_name, 
        category_name, 
        sub_category_name, 
        user_ref,
        user_fullname,
        task_type,
        arayan,
        garanti_durumu,
        is_planned,
        planned_date,
        product_1,
        product_2,
        product_3,
        product_4,
        product_5,
        JSON_ARRAY(
            NULLIF(product_1, ''),
            NULLIF(product_2, ''),
            NULLIF(product_3, ''),
            NULLIF(product_4, ''),
            NULLIF(product_5, '')
        ) AS products
    FROM test 
    WHERE 1=1 ";

    // Dinamik filtreler
  // UID varsa ve 0'dan büyükse filtre uygula (uid=0 ise tüm veriler gelsin)
if (!is_null($uid) && $uid > 0) {
    $query .= "AND user_ref = :uid ";
}


    $planned = null;
    if (isset($_GET['planned'])) {
        $planned = (int)$_GET['planned'];
        $query .= "AND is_planned = :planned ";
    }

    $query .= "ORDER BY created_date DESC, id DESC
               LIMIT :limit OFFSET :offset";

    $stmt = $db->prepare($query);

    // Parametre bağlama
if (!is_null($uid) && $uid > 0) {
    $stmt->bindParam(':uid', $uid, PDO::PARAM_INT);
}


    if (!is_null($planned)) {
        $stmt->bindParam(':planned', $planned, PDO::PARAM_INT);
    }

    $stmt->bindParam(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindParam(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    $tasks = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Boş ürünleri temizle
    foreach ($tasks as &$task) {
        $products = array_filter([
            $task['product_1'],
            $task['product_2'],
            $task['product_3'],
            $task['product_4'],
            $task['product_5']
        ], function($product) {
            return !empty($product);
        });

        $task['products'] = array_values($products);

        unset(
            $task['product_1'],
            $task['product_2'],
            $task['product_3'],
            $task['product_4'],
            $task['product_5']
        );
    }

    $response->getBody()->write(json_encode($tasks, JSON_UNESCAPED_UNICODE));
    return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
});




// 🟠 **Belirli Bir Görevi Getir (GET)**
$group->get('/{id}', function (Request $request, Response $response, array $args) {
    try {
        $db = getDBConnection();
        $query = "
        SELECT 
            t.*,
            t.garanti_durumu, -- garanti_durumu eklendi
            t.price,
            s.status AS status_name,
            c.c_name AS customer_name,
            c.c_email AS customer_email,
            b.name AS branch_name,
            cat.name AS category_name,
            sub_cat.name AS sub_category_name,
            CONCAT(u.name, ' ', u.surname) AS user_fullname,
            JSON_ARRAY(
                NULLIF(t.product_1, ''),
                NULLIF(t.product_2, ''),
                NULLIF(t.product_3, ''),
                NULLIF(t.product_4, ''),
                NULLIF(t.product_5, '')
            ) AS products
        FROM tasks t
        LEFT JOIN customer c ON t.customer_ref = c.id
        LEFT JOIN branch b ON t.branch_ref = b.id
        LEFT JOIN category cat ON t.category_ref = cat.id
        LEFT JOIN sub_category sub_cat ON t.sub_category_ref = sub_cat.id
        LEFT JOIN users u ON t.user_ref = u.id
        LEFT JOIN status s ON t.status = s.id
        WHERE t.id = ?
        ";

        $stmt = $db->prepare($query);
        $stmt->execute([$args['id']]);
        $task = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($task) {
            // Boş ürünleri temizle
            $products = array_filter([
                $task['product_1'],
                $task['product_2'],
                $task['product_3'],
                $task['product_4'],
                $task['product_5']
            ], function($product) {
                return !empty($product);
            });

            $task['products'] = array_values($products);

            // Tekil ürün alanlarını kaldır
            unset(
                $task['product_1'],
                $task['product_2'],
                $task['product_3'],
                $task['product_4'],
                $task['product_5']
            );

            $response->getBody()->write(json_encode($task, JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json; charset=utf-8')->withStatus(200);
        } else {
            $response->getBody()->write(json_encode([
                "status" => "error",
                "message" => "Görev bulunamadı."
            ]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
        }
    } catch (Exception $e) {
        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => "Sunucu hatası: " . $e->getMessage()
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
    }
});


        // ✅ **Görev Güncelleme (PUT)**
   // tasks/update/{id} endpoint
$group->put('/update/{id}', function (Request $request, Response $response, array $args) {
    try {
        $data = json_decode($request->getBody()->getContents(), true);
        $taskId = $args['id'];
        $is_planned =$data['is_planned'] ?? null;
        $status = $data['status'] ?? null;
      
        $updateUserRef = $data['update_user_ref'] ?? null;
        $updateDate = $data['update_date'] ?? date('Y-m-d H:i:s');
      

        if (!$status ||!$updateUserRef) {
            $response->getBody()->write(json_encode([
                "status" => "error",
                "message" => "Eksik alanlar var!"
            ]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
        }

        $db = getDBConnection();
        $db->beginTransaction();

        try {
            // Tasks tablosunu güncelle
            $stmt = $db->prepare("
                UPDATE tasks 
                SET 
                    status = ?, 
                    is_planned = ?,
                    update_date = ?,
                    update_user_ref = ?
                WHERE id = ?
            ");
            
            $stmt->execute([
               
                $status, 
                $is_planned,
                $updateDate,
                $updateUserRef, 
                $taskId
            ]);

            // İşlem başarılı
            $db->commit();
            
            $response->getBody()->write(json_encode([
                "status" => "success",
                "message" => "Görev güncellendi",
               
            ]));
            return $response->withHeader('Content-Type', 'application/json');

        } catch (Exception $e) {
            $db->rollBack();
            throw $e;
        }

    } catch (Exception $e) {
        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => "Sunucu hatası: " . $e->getMessage()
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
    }
});

// özel update
$group->put('/update/v2/{id}', function (Request $request, Response $response, array $args) {
    try {
        $data = json_decode($request->getBody()->getContents(), true);
        $taskId = $args['id'];

        if (!$taskId || empty($data) || !is_array($data)) {
            return $response->withJson([
                "status" => "error",
                "message" => "Geçersiz veri veya ID"
            ], 400);
        }

        $db = getDBConnection();
        $db->beginTransaction();

        try {
            // Güncellenmesine izin verilen sütunlar
            $allowedFields = [
                'customer_ref', 'branch_ref', 'type', 'category_ref', 'sub_category_ref',
                'description', 'details', 'status', 'contract_status', 'total_time',
                'is_planned', 'planned_date', 'user_ref', 'created_date', 'update_date',
                'update_user_ref', 'created_by', 'phone', 'arayan', 'price',
                'completion_note', 'completed_at', 'garanti_durumu',
                'product_1', 'product_2', 'product_3', 'product_4', 'product_5'
            ];

            $fields = [];
            $values = [];

            foreach ($data as $key => $value) {
                if (in_array($key, $allowedFields)) {
                    $fields[] = "`$key` = ?";
                    $values[] = $value;
                }
            }

            if (empty($fields)) {
                return $response->withJson([
                    "status" => "error",
                    "message" => "Güncellenecek geçerli bir alan yok"
                ], 400);
            }

            $values[] = $taskId; // WHERE id = ?

            $sql = "UPDATE tasks SET " . implode(', ', $fields) . " WHERE id = ?";
            $stmt = $db->prepare($sql);
            $stmt->execute($values);

            $db->commit();

            return $response->withJson([
                "status" => "success",
                "message" => "Görev başarıyla güncellendi",
                "updated_fields" => array_keys($data)
            ]);

        } catch (Exception $e) {
            $db->rollBack();
            return $response->withJson([
                "status" => "error",
                "message" => "Veritabanı hatası: " . $e->getMessage()
            ], 500);
        }

    } catch (Exception $e) {
        return $response->withJson([
            "status" => "error",
            "message" => "Sunucu hatası: " . $e->getMessage()
        ], 500);
    }
});



            // ✅ **Görev Silme (DELETE)**
            $group->delete('/delete/{id}', function (Request $request, Response $response, array $args) {
                try {
                    $db = getDBConnection();
                    $stmt = $db->prepare("DELETE FROM tasks WHERE id = ?");
                    $stmt->execute([$args['id']]);
    
                    $response->getBody()->write(json_encode(["status" => "success", "message" => "Görev silindi."]));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
    
                } catch (Exception $e) {
                    $response->getBody()->write(json_encode([
                        "status" => "error",
                        "message" => "Sunucu hatası: " . $e->getMessage()
                    ]));
                    return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
                }
            });
              // ✅ **Görev  Çoğalt)**
            $group->post('/copy/{id}', function (Request $request, Response $response, array $args) {
    try {
        $db = getDBConnection();

        // Orijinal görevi al
        $stmt = $db->prepare("SELECT * FROM tasks WHERE id = ?");
        $stmt->execute([$args['id']]);
        $originalTask = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$originalTask) {
            $response->getBody()->write(json_encode([
                "status" => "error",
                "message" => "Görev bulunamadı."
            ]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
        }

        // Yeni görevi oluştur
        $stmt = $db->prepare("
            INSERT INTO tasks (
                customer_ref,
                branch_ref,
                type,
                category_ref,
                sub_category_ref,
                description,
                details,
                status,
                total_time,
                user_ref,
                created_date,
                update_date,
                update_user_ref,
                created_by,
                arayan,
                garanti_durumu,
                completion_note,
                completed_at,
                product_1,
                product_2,
                product_3,
                product_4,
                product_5,
                cloned
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, NOW(), NULL, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, 1
            )
        ");

        $stmt->execute([
            $originalTask['customer_ref'],
            $originalTask['branch_ref'],
            $originalTask['type'],
            $originalTask['category_ref'],
            $originalTask['sub_category_ref'],
            $originalTask['description'],
            $originalTask['details'],
            $originalTask['user_ref'],
            $originalTask['update_user_ref'],
            $originalTask['created_by'],
            $originalTask['arayan'],
            $originalTask['garanti_durumu'],
            $originalTask['product_1'],
            $originalTask['product_2'],
            $originalTask['product_3'],
            $originalTask['product_4'],
            $originalTask['product_5'],
        ]);

        $response->getBody()->write(json_encode([
            "status" => "success",
            "message" => "Görev başarıyla çoğaltıldı."
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(201);

    } catch (Exception $e) {
        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => "Sunucu hatası: " . $e->getMessage()
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
    }
});

      // ✅ **Belirli Müşteriye Ait Görevleri Listele (GET)**
$group->get('/customer/{customerId}', function (Request $request, Response $response, array $args) {
    try {
        $db = getDBConnection();
        $customerId = $args['customerId'];

        $stmt = $db->prepare("
            SELECT 
                t.id,
                t.customer_ref,
                t.branch_ref,
                b.name AS branch_name,
                t.type,
                t.category_ref,
                c.name AS category_name,
                t.sub_category_ref,
                sc.name AS sub_category_name,
                t.description,
                t.details,
                t.status,
                t.total_time,
                t.user_ref,
                u.name AS user_name,
                u.surname AS user_surname,
                t.created_date,
                t.update_date,
                t.update_user_ref,
                uu.name AS update_user_name,
                uu.surname AS update_user_surname,
                t.created_by,
                t.arayan,
                t.garanti_durumu,
                t.completion_note,
                t.completed_at,
                t.product_1,
                t.product_2,
                t.product_3,
                t.product_4,
                t.product_5
            FROM tasks t
            LEFT JOIN users u ON t.user_ref = u.id
            LEFT JOIN users uu ON t.update_user_ref = uu.id
            LEFT JOIN branch b ON t.branch_ref = b.id
            LEFT JOIN category c ON t.category_ref = c.id
            LEFT JOIN sub_category sc ON t.sub_category_ref = sc.id
            WHERE t.customer_ref = ? 
            ORDER BY t.created_date DESC
        ");
        
        $stmt->execute([$customerId]);
        $tasks = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $response->getBody()->write(json_encode($tasks));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);

    } catch (Exception $e) {
        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => "Sunucu hatası: " . $e->getMessage()
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
    }
});

        // ✅ **Görev Detaylarını Getir (GET)**
$group->get('/details/{id}', function (Request $request, Response $response, array $args) {
    try {
        $db = getDBConnection();

        if (!isset($args['id'])) {
            throw new Exception('Task ID gerekli');
        }

        $taskId = $args['id'];

        // Ana task bilgilerini çek
        $taskQuery = "SELECT t.*, 
            c.c_name as customer_name, c.c_name2 as customer_name2, c.c_email, c.c_phone,
            b.name as branch_name,
            cat.name as category_name,
            sub.name as sub_category_name,
            u.name as created_by_name,
            CASE 
                WHEN t.status = 1 THEN 'Tamamlandı'
                WHEN t.status = 0 THEN 'Devam Ediyor'
                ELSE 'Bekliyor'
            END as status_text
        FROM tasks t
        LEFT JOIN customer c ON t.customer_ref = c.id
        LEFT JOIN branch b ON t.branch_ref = b.id
        LEFT JOIN category cat ON t.category_ref = cat.id
        LEFT JOIN sub_category sub ON t.sub_category_ref = sub.id
        LEFT JOIN users u ON t.created_by = u.id
        WHERE t.id = ?";

        $stmt = $db->prepare($taskQuery);
        $stmt->execute([$taskId]);
        $taskData = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$taskData) {
            throw new Exception('Task bulunamadı');
        }

        // Toplam süreyi saat:dakika:saniye formatına çevir
        $totalTime = $taskData['total_time'];
        $hours = floor($totalTime / 3600);
        $minutes = floor(($totalTime % 3600) / 60);
        $seconds = $totalTime % 60;
        $taskData['formatted_total_time'] = sprintf('%02d:%02d:%02d', $hours, $minutes, $seconds);

        // Transfer geçmişini çek
        $transferQuery = "SELECT tl.*, 
            u_from.name as from_user_name,
            u_to.name as to_user_name,
            tl.transfer_date,
            tl.description
        FROM transfer_log tl
        LEFT JOIN users u_from ON tl.from_user = u_from.id
        LEFT JOIN users u_to ON tl.to_user = u_to.id
        WHERE tl.task_ref = ?
        ORDER BY tl.transfer_date DESC";

        $stmt = $db->prepare($transferQuery);
        $stmt->execute([$taskId]);
        $transfers = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Aksiyon geçmişini çek
        $actionQuery = "SELECT a.*,
            u.name as user_name,
            a.start_time,
            a.end_time,
            a.description
        FROM actions a
        LEFT JOIN users u ON a.created_by = u.id
        WHERE a.tasks_id = ?
        ORDER BY a.start_time DESC";

        $stmt = $db->prepare($actionQuery);
        $stmt->execute([$taskId]);
        $actions = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Tüm verileri birleştir
        $response->getBody()->write(json_encode([
            'status' => 'success',
            'task' => $taskData,
            'transfers' => $transfers,
            'actions' => $actions
        ]));

        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);

    } catch (Exception $e) {
        $response->getBody()->write(json_encode([
            'status' => 'error',
            'message' => $e->getMessage()
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
    }
});

        
// ✅ **Görev Tamamlama (POST)**
$group->post('/{id}/complete', function (Request $request, Response $response, array $args) {
    try {
        $db = getDBConnection();
        $data = json_decode($request->getBody(), true);
        
        // Gerekli alanları kontrol et
        if (!isset($data['completion_note'])) {
            throw new Exception("Tamamlama açıklaması gereklidir.");
        }

       

        // Görevi güncelle
        $stmt = $db->prepare("
            UPDATE tasks 
            SET status = 3, 
                completion_note = ?, 
                price = ?,
                completed_at = NOW(), 
                update_date = NOW()
            WHERE id = ?
        ");
        
        $stmt->execute([
            $data['completion_note'],
            $data['price'],
            $args['id']
        ]);

        $response->getBody()->write(json_encode([
            "status" => "success",
            "message" => "Görev başarıyla tamamlandı."
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);

    } catch (Exception $e) {
        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => "Sunucu hatası: " . $e->getMessage()
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
    }
});

// Task Note routes
$group->post('/note/add', function (Request $request, Response $response) {
    try {
        $data = $request->getParsedBody();

        // Eksik veya boş parametreleri kontrol et
        $missingParams = [];

        if (empty($data['r'])) {
            $missingParams[] = "task_id";
        }
        if (empty($data['note'])) {
            $missingParams[] = "note";
        }
        if (empty($data['user_by'])) {
            $missingParams[] = "user_by";
        }

        if (!empty($missingParams)) {
            $response->getBody()->write(json_encode([
                "status" => "error",
                "message" => "Eksik veya boş parametreler: " . implode(", ", $missingParams)
            ]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
        }

        $taskId = $data['task_id'];
        $note = $data['note'];
        $userBy = $data['user_by'];
        $date = date('Y-m-d H:i:s');

        // Veritabanı bağlantısını al
        $db = getDBConnection();

        // Task note'u ekle
        $stmt = $db->prepare("INSERT INTO task_note (task_ref, note, user_by, date) VALUES (?, ?, ?, ?)");
        if (!$stmt->execute([$taskId, $note, $userBy, $date])) {
            throw new Exception("Veritabanına kayıt eklenemedi.");
        }

        $response->getBody()->write(json_encode([
            "status" => "success",
            "message" => "Durum notu başarıyla eklendi",
            "data" => [
                "task_ref" => $taskId,
                "note" => $note,
                "user_by" => $userBy,
                "date" => $date
            ]
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(201);

    } catch (PDOException $e) {
        // Veritabanı hatası
        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => "Veritabanı hatası: " . $e->getMessage()
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
    } catch (Exception $e) {
        // Genel hata yakalama
        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => "Sunucu hatası: " . $e->getMessage()
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
    }
});

// Task'a Ait Notları Getir
$group->get('/{task_id}/notes', function (Request $request, Response $response, array $args) {
    try {
        $taskId = $args['task_id'];
        
        $db = getDBConnection();
        
        $stmt = $db->prepare("
            SELECT 
                tn.*,
                u.full_name as user_name
            FROM task_note tn
            LEFT JOIN users u ON tn.user_by = u.id
            WHERE tn.task_ref = ?
            ORDER BY tn.date DESC
        ");
        $stmt->execute([$taskId]);
        $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $response->getBody()->write(json_encode([
            "status" => "success",
            "data" => $notes
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);

    } catch (Exception $e) {
        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => "Sunucu hatası: " . $e->getMessage()
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
    }
});

// Task Güncelleme Endpoint'i
$group->put('/{id}', function (Request $request, Response $response, array $args) {
    try {
        $data = json_decode($request->getBody()->getContents(), true);
        $taskId = $args['id'];

        // Güncellenebilecek alanları kontrol et
        $updateFields = [];
        $params = [];

        // Müşteri adı güncelleme
        if (isset($data['customer_name'])) {
            $updateFields[] = "customer_ref = (SELECT id FROM customer WHERE c_name = ?)";
            $params[] = $data['customer_name'];
        }

        // Şube güncelleme
        if (isset($data['branch_ref'])) {
            $updateFields[] = "branch_ref = ?";
            $params[] = $data['branch_ref'];
        }

        // Kategori güncelleme
        if (isset($data['category_ref'])) {
            $updateFields[] = "category_ref = ?";
            $params[] = $data['category_ref'];
        }

        // Alt kategori güncelleme
        if (isset($data['sub_category_ref'])) {
            $updateFields[] = "sub_category_ref = ?";
            $params[] = $data['sub_category_ref'];
        }

        // Açıklama güncelleme
        if (isset($data['description'])) {
            $updateFields[] = "description = ?";
            $params[] = $data['description'];
        }

        // Detaylar güncelleme
        if (isset($data['details'])) {
            $updateFields[] = "details = ?";
            $params[] = $data['details'];
        }

        // Arayan güncelleme
        if (isset($data['arayan'])) {
            $updateFields[] = "arayan = ?";
            $params[] = $data['arayan'];
        }

        // Telefon güncelleme
        if (isset($data['phone'])) {
            $updateFields[] = "phone = ?";
            $params[] = $data['phone'];
        }

        // Tip güncelleme
        if (isset($data['type'])) {
            $updateFields[] = "type = ?";
            $params[] = $data['type'];
        }

        // Güncelleme tarihi ve kullanıcısı
        $updateFields[] = "update_date = NOW()";
        if (isset($data['update_user_ref'])) {
            $updateFields[] = "update_user_ref = ?";
            $params[] = $data['update_user_ref'];
        }

        if (empty($updateFields)) {
            $response->getBody()->write(json_encode([
                "status" => "error",
                "message" => "Güncellenecek alan bulunamadı!"
            ]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
        }

        $db = getDBConnection();
        
        // Update sorgusu
        $sql = "UPDATE tasks SET " . implode(", ", $updateFields) . " WHERE id = ?";
        $params[] = $taskId;

        $stmt = $db->prepare($sql);
        $stmt->execute($params);

        if ($stmt->rowCount() > 0) {
           // ... existing code ...
            // Güncellenmiş task'ı getir
            $stmt = $db->prepare("
                SELECT t.*, 
                    c.c_name as customer_name,
                    CASE 
                        WHEN t.branch_ref = 0 THEN NULL 
                        ELSE b.name 
                    END as branch_name,
                    cat.name as category_name,
                    sub.name as sub_category_name
                FROM tasks t
                LEFT JOIN customer c ON t.customer_ref = c.id
                LEFT JOIN branch b ON t.branch_ref = b.id AND t.branch_ref != 0
                LEFT JOIN category cat ON t.category_ref = cat.id
                LEFT JOIN sub_category sub ON t.sub_category_ref = sub.id
                WHERE t.id = ?
            ");
// ... existing code ...
            $stmt->execute([$taskId]);
            $updatedTask = $stmt->fetch(PDO::FETCH_ASSOC);

            $response->getBody()->write(json_encode([
                "status" => "success",
                "message" => "Task başarıyla güncellendi",
                "data" => $updatedTask
            ]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
        } else {
            $response->getBody()->write(json_encode([
                "status" => "error",
                "message" => "Task bulunamadı veya güncelleme yapılmadı"
            ]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(404);
        }

    } catch (Exception $e) {
        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => "Sunucu hatası: " . $e->getMessage()
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
    }
});

$group->get('/tasks/by-date-range', function (Request $request, Response $response) {
    try {
        $db = getDBConnection();

        $queryParams = $request->getQueryParams();

        // Tarih parametreleri
        $startDate = $queryParams['start'] ?? null;
        $endDate   = $queryParams['end'] ?? null;

        if (!$startDate || !$endDate) {
            $response->getBody()->write(json_encode([
                "status" => "error",
                "message" => "start ve end parametreleri zorunludur"
            ]));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
        }

        $stmt = $db->prepare("
            SELECT 
                t.id,
                t.customer_ref,
                cst.c_name AS customer_name,

                t.branch_ref,
                b.name AS branch_name,

                t.type,

                t.category_ref,
                c.name AS category_name,

                t.sub_category_ref,
                sc.name AS sub_category_name,

                t.description,
                t.details,
                t.status,
                t.total_time,

                t.user_ref,
                u.name AS user_name,
                u.surname AS user_surname,

                t.created_date,
                t.completed_at,

                t.update_user_ref,
                uu.name AS update_user_name,
                uu.surname AS update_user_surname,

                t.created_by,
                t.arayan,
                t.garanti_durumu,
                t.completion_note,

                t.product_1,
                t.product_2,
                t.product_3,
                t.product_4,
                t.product_5

            FROM tasks t
            LEFT JOIN users u  ON t.user_ref = u.id
            LEFT JOIN users uu ON t.update_user_ref = uu.id
            LEFT JOIN branch b ON t.branch_ref = b.id
            LEFT JOIN category c ON t.category_ref = c.id
            LEFT JOIN sub_category sc ON t.sub_category_ref = sc.id
            LEFT JOIN customer cst ON t.customer_ref = cst.id

            WHERE t.completed_at >= :startDate
              AND t.completed_at < DATE_ADD(:endDate, INTERVAL 1 DAY)

              AND t.status = 3
              AND t.contract_status = 0
              AND t.type IN ('Uzaktan Destek', 'Bilgilendirme')

            ORDER BY cst.c_name, t.completed_at DESC
        ");

        $stmt->execute([
            ':startDate' => $startDate,
            ':endDate'   => $endDate
        ]);

        $tasks = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $response->getBody()->write(json_encode($tasks, JSON_UNESCAPED_UNICODE));
        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus(200);

    } catch (Exception $e) {

        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => "Sunucu hatası",
            "detail"  => $e->getMessage()
        ]));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus(500);
    }
});


$group->get('/tasks/by-date', function (Request $request, Response $response) {
    try {
        $db = getDBConnection();

        // Tarihi parametre olarak al, yoksa bugünün tarihi
        $queryParams = $request->getQueryParams();
        $date = isset($queryParams['date']) ? $queryParams['date'] : date('Y-m-d');

        $stmt = $db->prepare("
            SELECT 
                t.id,
                t.customer_ref,
                cst.c_name AS customer_name,
                t.branch_ref,
                b.name AS branch_name,
                t.type,
                t.category_ref,
                c.name AS category_name,
                t.sub_category_ref,
                sc.name AS sub_category_name,
                t.description,
                t.details,
                t.status,
                t.total_time,
                t.user_ref,
                u.name AS user_name,
                u.surname AS user_surname,
                t.created_date,
                t.update_date,
                t.update_user_ref,
                uu.name AS update_user_name,
                uu.surname AS update_user_surname,
                t.created_by,
                t.arayan,
                t.garanti_durumu,
                t.completion_note,
                t.completed_at,
                t.product_1,
                t.product_2,
                t.product_3,
                t.product_4,
                t.product_5
            FROM tasks t
            LEFT JOIN users u ON t.user_ref = u.id
            LEFT JOIN users uu ON t.update_user_ref = uu.id
            LEFT JOIN branch b ON t.branch_ref = b.id
            LEFT JOIN category c ON t.category_ref = c.id
            LEFT JOIN sub_category sc ON t.sub_category_ref = sc.id
            LEFT JOIN customer cst ON t.customer_ref = cst.id
            WHERE DATE(t.completed_at) = ?
              AND t.status = 3
              AND t.contract_status = 0
              AND t.type IN ('Uzaktan Destek', 'Bilgilendirme')
            ORDER BY t.completed_at DESC
        ");

        $stmt->execute([$date]);
        $tasks = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $response->getBody()->write(json_encode($tasks));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);

    } catch (Exception $e) {
        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => "Sunucu hatası: " . $e->getMessage()
        ]));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(500);
    }
});


///

$group->get('/no/no', function (Request $request, Response $response, array $args) {
    try {
        $db = getDBConnection();

        $stmt = $db->prepare("SELECT * FROM test");
        $stmt->execute();
        $tasks = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $response->getBody()->write(json_encode([
            "status" => "success",
            "data" => $tasks
        ], JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json; charset=utf-8')->withStatus(200);

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