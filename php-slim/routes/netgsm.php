<?php
require_once __DIR__ . '/../config/db.php'; // Veritabanı bağlantı fonksiyonunu içe aktar
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

return function ($app)
{
    $app->group('/netgsm', function ($group)
    {

      $group->post('/category-yazilim', function (Request $request, Response $response) {
    try {
        $pdo = getDBConnection();

        $parsed = $request->getParsedBody();
        $body = $request->getBody()->getContents();
        $json = json_decode($body, true);

        $data = is_array($json) && !empty($json) ? $json : (is_array($parsed) && !empty($parsed) ? $parsed : null);

        if (!$data || !isset($data['tus_bilgisi']) || !isset($data['arayan_no']) || !isset($data['arama_id'])) {
            throw new Exception("Gerekli bilgiler eksik.");
        }

        $tusBilgisi = $data['tus_bilgisi'];
        $arayanNo = $data['arayan_no'];
        $aramaId = $data['arama_id'];

        // Eğer 9 ise farklı yönlendir
        if ($tusBilgisi == '9') {
            $responseData = [
                "status" => "success",
                "data" => "",
                "result" => "interactivemenu",
                "redirect" => "kategori_yazilim"
            ];
            $response->getBody()->write(json_encode($responseData, JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
        }

        // Eğer 0 ise ana kategoriye yönlendir
        if ($tusBilgisi == '0') {
            $responseData = [
                "status" => "success",
                "data" => "",
                "result" => "menu",
                "redirect" => "anakategori"
            ];
            $response->getBody()->write(json_encode($responseData, JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
        }

        // Kategori eşlemesi
        $categories = [
            1 => "Logo",
            2 => "Vega",
            3 => "Diğer",
        ];

        if (!isset($categories[$tusBilgisi])) {
            throw new Exception("Geçersiz tuş bilgisi.");
        }

        $categoryRef = $categories[$tusBilgisi];

        $stmt = $pdo->prepare("INSERT INTO netgsm_pool (category, arayan_no, arama_id, transfer_status, create_date) 
               VALUES (:category, :arayan_no, :arama_id, 0, NOW())");
        $stmt->bindParam(':category', $categoryRef, PDO::PARAM_STR);
        $stmt->bindParam(':arayan_no', $arayanNo, PDO::PARAM_STR);
        $stmt->bindParam(':arama_id', $aramaId, PDO::PARAM_STR);
        $stmt->execute();

        $responseData = [
            "status" => "success",
            "data" => "",
            "result" => "interactivemenu",
            "redirect" => "sozlesmeNo"
        ];

        $response->getBody()->write(json_encode($responseData, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);

    } catch (Exception $e) {
        $errorResponse = ["status" => "error", "message" => $e->getMessage()];
        $response->getBody()->write(json_encode($errorResponse, JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(400);
    }
});


        ////
        $group->post('/category-donanim', function (Request $request, Response $response)
        {
            try
            {
                $pdo = getDBConnection();

                $parsed = $request->getParsedBody();
                $body = $request->getBody()
                    ->getContents();
                $json = json_decode($body, true);

                // Öncelik sırası:
                // 1. JSON varsa onu al
                // 2. Yoksa form verisini kullan
                // 3. Hâlâ veri yoksa hata
                $data = is_array($json) && !empty($json) ? $json : (is_array($parsed) && !empty($parsed) ? $parsed : null);

                if (!$data || !isset($data['tus_bilgisi']) || !isset($data['arayan_no']) || !isset($data['arama_id']))
                {
                    throw new Exception("Gerekli bilgiler eksik.");

                }

                $tusBilgisi = $data['tus_bilgisi'];
                $arayanNo = $data['arayan_no'];
                $aramaId = $data['arama_id'];
 // Eğer 9 ise farklı yönlendir
        if ($tusBilgisi == '9') {
            $responseData = [
                "status" => "success",
                "data" => "",
                "result" => "interactivemenu",
                "redirect" => "kategori_donanim"
            ];
            $response->getBody()->write(json_encode($responseData, JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
        }

        // Eğer 0 ise ana kategoriye yönlendir
        if ($tusBilgisi == '0') {
            $responseData = [
                "status" => "success",
                "data" => "",
                "result" => "menu",
                "redirect" => "anakategori"
            ];
            $response->getBody()->write(json_encode($responseData, JSON_UNESCAPED_UNICODE));
            return $response->withHeader('Content-Type', 'application/json')->withStatus(200);
        }
                $categories = [1 => "Bilgisayar ve Çevre Birimleri", 2 => "Yazıcı", 3 => "Yazarkasa - Terazi", 4 => "Barkod Ürünleri ve El Terminalleri", 5 => "Diğer",

                ];

                if (!isset($categories[$tusBilgisi]))
                {
                    throw new Exception("Geçersiz tuş bilgisi.");
                }

                $categoryRef = $categories[$tusBilgisi];

                $stmt = $pdo->prepare("INSERT INTO netgsm_pool (category, arayan_no, arama_id, transfer_status, create_date) 
               VALUES (:category, :arayan_no, :arama_id, 0, NOW())");
                $stmt->bindParam(':category', $categoryRef, PDO::PARAM_STR);
                $stmt->bindParam(':arayan_no', $arayanNo, PDO::PARAM_STR);
                $stmt->bindParam(':arama_id', $aramaId, PDO::PARAM_STR);
                $stmt->execute();

                $responseData = ["status" => "success", "data" => "", "result" => "interactivemenu", "redirect" => "sozlesmeNoDonanim"];

                $response->getBody()
                    ->write(json_encode($responseData, JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);

            }
            catch(Exception $e)
            {
                $errorResponse = ["status" => "error", "message" => $e->getMessage() ];
                $response->getBody()
                    ->write(json_encode($errorResponse, JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')
                    ->withStatus(400);
            }
        });

        $group->post('/sozlesme-yazilim', function (Request $request, Response $response)
        {
            try
            {
                $pdo = getDBConnection();
                $data = $request->getParsedBody();
                $tusBilgisi = $data['tus_bilgisi'] == '9' ? null : $data['tus_bilgisi'];

                $aramaId = $data['arama_id'];
                $updateDate = date('Y-m-d H:i:s');

                // Önce kategoriyi kontrol et
                $stmt = $pdo->prepare("SELECT category FROM netgsm_pool WHERE arama_id = :arama_id");
                $stmt->execute([':arama_id' => $aramaId]);
                $result = $stmt->fetch(PDO::FETCH_ASSOC);
                $categoryRef = $result['category'];

                // Sözleşme numarasını veritabanına kaydet
                $stmt = $pdo->prepare("UPDATE netgsm_pool SET sozlesme_no = :sozlesme_no, update_date = :update_date WHERE arama_id = :arama_id");
                $stmt->execute([':sozlesme_no' => $tusBilgisi, ':update_date' => $updateDate, ':arama_id' => $aramaId]);

                // Kategoriye göre yönlendirme
                $redirectMap = ["Logo" => "LOGO", "Vega" => "VEGA", "Diğer" => "yazilimdiger", 

                ];

               $redirect = $redirectMap[$categoryRef] ?? "yazilimdiger";

                $responseData = ["status" => "success", "data" => "", "result" => "queue", "redirect" => $redirect];

                $response->getBody()
                    ->write(json_encode($responseData, JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);

            }
            catch(Exception $e)
            {
                $responseData = ["status" => "error", "message" => $e->getMessage() ];
                $response->getBody()
                    ->write(json_encode($responseData, JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')
                    ->withStatus(400);
            }
        });
        //////
       $group->post('/sozlesme-donanim', function (Request $request, Response $response)
        {
            try
            {
                $pdo = getDBConnection();
                $data = $request->getParsedBody();
                $tusBilgisi = $data['tus_bilgisi'] == '9' ? null : $data['tus_bilgisi'];

                $aramaId = $data['arama_id'];
                $updateDate = date('Y-m-d H:i:s');

                // Önce kategoriyi kontrol et
                $stmt = $pdo->prepare("SELECT category FROM netgsm_pool WHERE arama_id = :arama_id");
                $stmt->execute([':arama_id' => $aramaId]);
                $result = $stmt->fetch(PDO::FETCH_ASSOC);
                $categoryRef = $result['category'];

                // Sözleşme numarasını veritabanına kaydet
                $stmt = $pdo->prepare("UPDATE netgsm_pool SET sozlesme_no = :sozlesme_no, update_date = :update_date WHERE arama_id = :arama_id");
                $stmt->execute([':sozlesme_no' => $tusBilgisi, ':update_date' => $updateDate, ':arama_id' => $aramaId]);

                // Kategoriye göre yönlendirme
                     $redirectMap = ["Donanımsal Sorun" => "yazarkasa", "Yazarkasa - Terazi" => "yazarkasa", "Diğer" => "donanimdiger", ];
                $categoryRef = preg_replace('/\s+/', ' ', trim($result['category']));

                $redirect = $redirectMap[$categoryRef] ?? "donanimdiger";

                $responseData = ["status" => "success", "data" => "", "result" => "queue", "redirect" => $redirect];

                $response->getBody()
                    ->write(json_encode($responseData, JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);

            }
            catch(Exception $e)
            {
                $responseData = ["status" => "error", "message" => $e->getMessage() ];
                $response->getBody()
                    ->write(json_encode($responseData, JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')
                    ->withStatus(400);
            }
        });

        ///
        $group->get('/pending-calls', function (Request $request, Response $response)
        {
            try
            {
                $pdo = getDBConnection();

                // UTF-8 ayarlarını zorunlu kıl
                $pdo->exec("SET NAMES 'utf8mb4'");
                $pdo->exec("SET CHARACTER SET utf8mb4");
                $pdo->exec("SET SESSION collation_connection = 'utf8mb4_unicode_ci'");

                // Transfer edilmemiş (transfer_status = 0) çağrıları getir ve müşteri adını ekle
                $stmt = $pdo->prepare("
          SELECT 
    np.*, 
    c.c_name, 
    c.sozlesmeNote,
    ct.status AS contract_status
FROM 
    netgsm_pool np
LEFT JOIN 
    customer c ON np.customer_ref = c.id
LEFT JOIN 
    contract ct ON np.sozlesme_no = ct.contract_no
WHERE 
    np.transfer_status = 0
ORDER BY 
    np.create_date DESC;

        ");
                $stmt->execute();

                $calls = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // JSON çıktısını UTF-8 olarak döndür
                $response->getBody()
                    ->write(json_encode($calls, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_NUMERIC_CHECK));
                return $response->withHeader('Content-Type', 'application/json; charset=UTF-8');

            }
            catch(Exception $e)
            {
                $errorResponse = ["status" => "error", "message" => $e->getMessage() ];
                $response->getBody()
                    ->write(json_encode($errorResponse, JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json; charset=UTF-8')
                    ->withStatus(500);
            }
        });


        //tamamlanan ya da silinen çağrılar
          $group->get('/ok-calls', function (Request $request, Response $response)
        {
            try
            {
                $pdo = getDBConnection();

                // UTF-8 ayarlarını zorunlu kıl
                $pdo->exec("SET NAMES 'utf8mb4'");
                $pdo->exec("SET CHARACTER SET utf8mb4");
                $pdo->exec("SET SESSION collation_connection = 'utf8mb4_unicode_ci'");

                // Transfer edilmemiş (transfer_status = 0) çağrıları getir ve müşteri adını ekle
                $stmt = $pdo->prepare("
   SELECT 
    np.id,
    IFNULL(c.c_name, 'Tanımlanamayan Müşteri') AS customer_name,
    np.category,
    np.transfer_status,
    np.arayan_no,
    CONCAT(u.name, ' ', u.surname) AS user_full_name,
    np.create_date
FROM 
    netgsm_pool np
LEFT JOIN 
    customer c ON np.customer_ref = c.id
LEFT JOIN 
    users u ON np.user_ref = u.id
WHERE 
    np.transfer_status IN (1, 2)
ORDER BY 
    np.id DESC;




        ");
                $stmt->execute();

                $calls = $stmt->fetchAll(PDO::FETCH_ASSOC);

                // JSON çıktısını UTF-8 olarak döndür
                $response->getBody()
                    ->write(json_encode($calls, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_NUMERIC_CHECK));
                return $response->withHeader('Content-Type', 'application/json; charset=UTF-8');

            }
            catch(Exception $e)
            {
                $errorResponse = ["status" => "error", "message" => $e->getMessage() ];
                $response->getBody()
                    ->write(json_encode($errorResponse, JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json; charset=UTF-8')
                    ->withStatus(500);
            }
        });


        $group->post('/take-call', function (Request $request, Response $response)
        {
            try
            {
                // Gelen veriyi JSON olarak al ve doğrula
                $data = json_decode($request->getBody()
                    ->getContents() , true);

                if (!isset($data['id']) || !isset($data['user_ref']))
                {
                    throw new Exception("Gerekli bilgiler eksik.", 400);
                }

                $pdo = getDBConnection();

                // Önce çağrının durumunu kontrol et
                $checkStmt = $pdo->prepare("
            SELECT transfer_status 
            FROM netgsm_pool 
            WHERE id = :id
        ");
                $checkStmt->execute([':id' => $data['id']]);
                $call = $checkStmt->fetch(PDO::FETCH_ASSOC);

                if (!$call)
                {
                    throw new Exception("Çağrı bulunamadı.", 404);
                }

                // Çağrı zaten devralınmışsa hata döndür
                if ($call['transfer_status'] != 0)
                {
                    throw new Exception("Bu çağrı zaten devralınmış.", 400);
                }

                // Çağrıyı güncelle (transfer_status'u 0 olarak bırak)
                $stmt = $pdo->prepare("
            UPDATE netgsm_pool 
            SET user_ref = :user_ref,
                update_date = NOW()
            WHERE id = :id AND transfer_status = 0
        ");

                $stmt->execute([':id' => $data['id'], ':user_ref' => $data['user_ref']]);

                // Başarılı yanıt
                $response->getBody()
                    ->write(json_encode(["status" => "success", "message" => "Çağrı başarıyla atandı"], JSON_UNESCAPED_UNICODE));

                return $response->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);

            }
            catch(PDOException $e)
            {
                // Veritabanı hatalarını yakala
                $errorResponse = ["status" => "error", "message" => "Veritabanı hatası: " . $e->getMessage() ];
                $response->getBody()
                    ->write(json_encode($errorResponse, JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')
                    ->withStatus(500);
            }
            catch(Exception $e)
            {
                // Diğer hataları yakala
                $errorResponse = ["status" => "error", "message" => $e->getMessage() ];
                $response->getBody()
                    ->write(json_encode($errorResponse, JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')
                    ->withStatus($e->getCode() ? : 400);
            }
        });

        // Yeni endpoint: transfer-status güncelleme
        $group->post('/update-transfer-status', function (Request $request, Response $response)
        {
            try
            {
                // Gelen veriyi JSON olarak al ve doğrula
                $data = json_decode($request->getBody()
                    ->getContents() , true);

                if (!isset($data['call_id']) || !isset($data['transfer_status']))
                {
                    throw new Exception("Gerekli bilgiler eksik.", 400);
                }

                $pdo = getDBConnection();

                // Transfer status'u güncelle
                $stmt = $pdo->prepare("
            UPDATE netgsm_pool 
            SET transfer_status = :transfer_status,
                update_date = NOW()
            WHERE id = :id
        ");

                $stmt->execute([':id' => $data['call_id'], ':transfer_status' => $data['transfer_status']]);

                if ($stmt->rowCount() === 0)
                {
                    throw new Exception("Çağrı bulunamadı.", 404);
                }

                // Başarılı yanıt
                $response->getBody()
                    ->write(json_encode(["status" => "success", "message" => "Transfer durumu güncellendi"], JSON_UNESCAPED_UNICODE));

                return $response->withHeader('Content-Type', 'application/json')
                    ->withStatus(200);

            }
            catch(PDOException $e)
            {
                $errorResponse = ["status" => "error", "message" => "Veritabanı hatası: " . $e->getMessage() ];
                $response->getBody()
                    ->write(json_encode($errorResponse, JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')
                    ->withStatus(500);
            }
            catch(Exception $e)
            {
                $errorResponse = ["status" => "error", "message" => $e->getMessage() ];
                $response->getBody()
                    ->write(json_encode($errorResponse, JSON_UNESCAPED_UNICODE));
                return $response->withHeader('Content-Type', 'application/json')
                    ->withStatus($e->getCode() ? : 400);
            }
        });
        
        // Yeni endpoint: transfer-status güncelleme (arama_id ile sabit 1 yapılır)
$group->post('/pool-delete', function (Request $request, Response $response) {
    try {
        // JSON veriyi al
        $data = json_decode($request->getBody()->getContents(), true);

        if (!isset($data['arama_id'])) {
            throw new Exception("arama_id bilgisi eksik.", 400);
        }

        $pdo = getDBConnection();
        // 2 silinen, 1 devralınan
        // transfer_status = 1 olarak güncelle
        $stmt = $pdo->prepare("
    UPDATE netgsm_pool
    SET 
        transfer_status = 2,
        user_ref = :user_id,
        update_date = NOW()
    WHERE 
        arama_id = :arama_id;
");

$stmt->execute([
    ':arama_id' => $data['arama_id'],
    ':user_id' => $data['user_id'],
]);


        if ($stmt->rowCount() === 0) {
            throw new Exception("Kayıt bulunamadı.", 404);
        }

        $response->getBody()->write(json_encode([
            "status" => "success",
            "message" => "Transfer durumu 1 olarak güncellendi"
        ], JSON_UNESCAPED_UNICODE));

        return $response->withHeader('Content-Type', 'application/json')->withStatus(200);

    } catch (PDOException $e) {
        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => "Veritabanı hatası: " . $e->getMessage()
        ], JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')->withStatus(500);

    } catch (Exception $e) {
        $response->getBody()->write(json_encode([
            "status" => "error",
            "message" => $e->getMessage()
        ], JSON_UNESCAPED_UNICODE));
        return $response->withHeader('Content-Type', 'application/json')
                        ->withStatus($e->getCode() ?: 400);
    }
});

    });
};

