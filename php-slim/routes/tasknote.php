<?php
require_once __DIR__ . '/../config/db.php';

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

return function ($app) {
    $app->group('/notes', function ($group) {

        // 📌 Sabit rota önce tanımlanmalı
        $group->get('/active', function (Request $request, Response $response) {
            try {
                $db = getDBConnection();

                $stmt = $db->prepare("
                    SELECT 
                        tn.id AS note_id,
                        tn.task_ref,
                        tn.note,
                        tn.user_by,
                        tn.date,
                        tn.in_service,
                        t.customer_ref,
                        t.product_1,
                        t.product_2,
                        t.product_3,
                        t.product_4,
                        t.product_5,
                        c.c_name
                    FROM task_note tn
                    INNER JOIN tasks t ON tn.task_ref = t.id
                    INNER JOIN customer c ON t.customer_ref = c.id
                    WHERE tn.in_service = 1 AND t.status != 3
                    ORDER BY tn.date DESC
                ");
                $stmt->execute();
                $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);

                $response->getBody()->write(json_encode([
                    "status" => "success",
                    "message" => "Aktif notlar başarıyla getirildi.",
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

        // Not ekleme
        $group->post('/{task_ref}/add', function (Request $request, Response $response, array $args) {
            try {
                $db = getDBConnection();
                $data = json_decode($request->getBody()->getContents(), true);

                if (empty($data['note']) || empty($data['user_by'])) {
                    throw new Exception("Not ve kullanıcı kimliği gereklidir.");
                }

                $taskRef = $args['task_ref'];
                $note = $data['note'];
                $userBy = $data['user_by'];
                $date = $data['date'];
                $in_service = $data['in_service'];

                $stmt = $db->prepare("
                    INSERT INTO task_note (task_ref, note, user_by, date, in_service) 
                    VALUES (?, ?, ?, ?, ?)
                ");
                $stmt->execute([$taskRef, $note, $userBy, $date, $in_service]);

                $insertedId = $db->lastInsertId();

                $response->getBody()->write(json_encode([
                    "status" => "success",
                    "message" => "Not başarıyla eklendi.",
                    "data" => [
                        "id" => $insertedId,
                        "task_ref" => $taskRef,
                        "note" => $note,
                        "user_by" => $userBy,
                        "date" => $date,
                        "in_service" => $in_service,
                    ]
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

        // Belirli görevin notlarını listele
        $group->get('/{id}', function (Request $request, Response $response, array $args) {
            try {
                $db = getDBConnection();
                $taskId = $args['id'];

                $stmt = $db->prepare("
                    SELECT id, task_ref, note, user_by, date 
                    FROM task_note 
                    WHERE task_ref = ?
                ");
                $stmt->execute([$taskId]);
                $notes = $stmt->fetchAll(PDO::FETCH_ASSOC);

                if (!$notes) {
                    throw new Exception("Bu göreve ait not bulunamadı.");
                }

                $response->getBody()->write(json_encode([
                    "status" => "success",
                    "message" => "Notlar başarıyla getirildi.",
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

    });
};
