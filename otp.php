<?php

if (!defined("a328763fe27bba"))
    define("a328763fe27bba","TRUE");
require_once("config.php");

// CORS headers
header("Access-Control-Allow-Origin: http://localhost:3000");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With");
header("Access-Control-Allow-Credentials: true");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Start session for storing OTP data
session_start();

$path = __DIR__ . '/.vscode/settings.json';
if (!file_exists($path)) {
	die("Settings file not found: $path");
}
$settings = json_decode(file_get_contents($path), true);
$apiKey = $settings['BREVO_API_KEY'] ?? null;
$fromEmail = $settings['FROM_EMAIL'] ?? null;
$fromName = $settings['FROM_NAME'] ?? null;

if (!$apiKey || !$fromEmail || !$fromName) {
    die("Please update settings.json with brevo api key and sender details");
}

// Get action from URL parameter
$action = $_GET['data'] ?? $_POST['data'] ?? '';

// Rate limiting check
function checkRateLimit($username) {
    $query = "SELECT COUNT(*) FROM login_attempts WHERE username = ? AND attempt_time > DATE_SUB(NOW(), INTERVAL 1 HOUR)";
    $result = mysql_fetch_array($query, [$username]);
    $attempts = $result[0][0] ?? 0;
    return $attempts < 5; // Allow 5 attempts per hour
}

// Log failed attempt
function logFailedAttempt($username) {
    $ip = get_clients_ip();
    $query = "INSERT INTO login_attempts (username, attempt_time, ip_address) VALUES (?, NOW(), ?)";
    $result = mysql_fetch_array($query, [$username, $ip]);
}

// Generate 6-digit OTP
function generateOTP() {
    return str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);
}

function sendOTPEmail($email, $otp) {
    global $fromEmail, $fromName, $apiKey;
    // Recipient email
    $toEmail = $email;

    // Email subject and HTML content
    $subject = "Your OTP Code";
    $htmlContent = "
        <html>
        <body>
            <h2>Your OTP Code</h2>
            <p>Your one-time password (OTP) is: <strong>$otp</strong></p>
            <p>This code will expire in 5 minutes.</p>
        </body>
        </html>
    ";

    // Prepare payload for Brevo API
    $data = [
        'sender' => [
            'email' => $fromEmail,
            'name' => $fromName
        ],
        'to' => [
            ['email' => $toEmail]
        ],
        'subject' => $subject,
        'htmlContent' => $htmlContent
    ];

    // Initialize cURL
    $ch = curl_init('https://api.brevo.com/v3/smtp/email');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

    // Disable SSL verification
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

    // Set cURL options
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));

    // Set headers
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'api-key: ' . $apiKey,
        'Content-Type: application/json',
        'Accept: application/json'
    ]);

    // Execute request
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    if ($response === false) {
        echo "Curl error: " . curl_error($ch);
    } else {
        if ($httpCode >= 200 && $httpCode < 300) {
            return true;
        } else {
            echo "Failed to send email. HTTP Status Code: $httpCode\n";
            echo "Response: $response\n";
        }
    }

    curl_close($ch);
}

// Verify user credentials
function verifyUser($username) {
    $query = "SELECT id, email FROM users WHERE username = ?";
    $result = mysql_fetch_array($query, [$username]);
    $user = $result[0] ?? 0;
    
    if ($user)
        return $user;

    return false;
}

if (isset($action) && str_ends_with($action, '_otp')) {
switch($action) {
    case 'request_otp':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'message' => 'Invalid request method']);
            exit();
        }
        
        $username = $_POST['username'] ?? '';
        
        if (empty($username)) {
            echo json_encode(['success' => false, 'message' => 'Username required']);
            exit();
        }
        
        // Check rate limiting
        if (!checkRateLimit($username)) {
            echo json_encode(['success' => false, 'message' => 'Too many attempts. Try again later.']);
            exit();
        }
        
        // Verify user credentials
        $user = verifyUser($username);
        if (!$user) {
            logFailedAttempt($username);
            echo json_encode(['success' => false, 'message' => 'Invalid credentials']);
            exit();
        }
        
        // Generate and store OTP
        $otp = generateOTP();
        $_SESSION['otp'] = $otp;
        $_SESSION['otp_user_id'] = $user['id'];
        $_SESSION['otp_expires'] = time() + 600; // 10 minutes
        $_SESSION['otp_attempts'] = 0;
        
        // Send OTP via email
        if (sendOTPEmail($user['email'], $otp)) {
            echo json_encode(['success' => true, 'message' => 'OTP sent to your email']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Failed to send OTP']);
        }
        break;
        
    case 'verify_otp':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'message' => 'Invalid request method']);
            exit();
        }
        
        $username = $_POST['username'] ?? '';
        $otp = $_POST['otp'] ?? '';
        
        if (empty($username) || empty($otp)) {
            echo json_encode(['success' => false, 'message' => 'Username and OTP required']);
            exit();
        }
        
        // Check if OTP exists and hasn't expired
        if (!isset($_SESSION['otp']) || !isset($_SESSION['otp_expires']) || time() > $_SESSION['otp_expires']) {
            echo json_encode(['success' => false, 'message' => 'OTP expired. Please request a new one.']);
            exit();
        }
        
        // Check attempt limit
        if (($_SESSION['otp_attempts'] ?? 0) >= 5) {
            echo json_encode(['success' => false, 'message' => 'Too many OTP attempts. Please request a new one.']);
            exit();
        }
        
        $_SESSION['otp_attempts'] = ($_SESSION['otp_attempts'] ?? 0) + 1;
        
        // Verify OTP
        if ($otp === $_SESSION['otp']) {
            // Generate session token
            $token = bin2hex(random_bytes(32));
            
            // Store token in database
            $query = "INSERT INTO user_sessions (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))";
            $result = mysql_fetch_array($query, [$_SESSION['otp_user_id'], $token]);
            
            // Clear OTP data
            unset($_SESSION['otp'], $_SESSION['otp_user_id'], $_SESSION['otp_expires'], $_SESSION['otp_attempts']);
            
            echo json_encode(['success' => true, 'token' => $token]);
        } else {
            logFailedAttempt($username, $pdo);
            echo json_encode(['success' => false, 'message' => 'Invalid OTP']);
        }
        break;
        
    case 'resend_otp':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'message' => 'Invalid request method']);
            exit();
        }
        
        $username = $_POST['username'] ?? '';
        
        if (empty($username)) {
            echo json_encode(['success' => false, 'message' => 'Username required']);
            exit();
        }
        
        // Check if user has valid session
        if (!isset($_SESSION['otp_user_id'])) {
            echo json_encode(['success' => false, 'message' => 'Please start login process again']);
            exit();
        }
        
        // Get user email
        $stmt = $pdo->prepare("SELECT email FROM users WHERE id = ?");
        $stmt->execute([$_SESSION['otp_user_id']]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$user) {
            echo json_encode(['success' => false, 'message' => 'User not found']);
            exit();
        }
        
        // Generate new OTP
        $otp = generateOTP();
        $_SESSION['otp'] = $otp;
        $_SESSION['otp_expires'] = time() + 600; // 10 minutes
        $_SESSION['otp_attempts'] = 0; // Reset attempts
        
        // Send new OTP
        if (sendOTPEmail($user['email'], $otp)) {
            echo json_encode(['success' => true, 'message' => 'New OTP sent to your email']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Failed to send OTP']);
        }
        break;
    default:
        echo json_encode(['success' => false, 'message' => 'Invalid otp action']);
        break;
    }
}
?>