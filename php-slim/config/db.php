<?php
// Eğer fonksiyon daha önce tanımlandıysa tekrar tanımlama!
if (!function_exists('getDBConnection')) {
    function getDBConnection() {
        $host = "localhost";
        $dbname = "bolutekn_support";
        $username = "bolutekn_boltech";
        $password = "Ozt129103.Bolu";

        try {
            $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
            ]);

            return $pdo;
        } catch (PDOException $e) {
            die(json_encode(["status" => "error", "message" => "Veritabanı bağlantı hatası: " . $e->getMessage()]));
        }
    }
}
