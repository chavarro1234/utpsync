<?php
session_start();
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Configuración de la base de datos (XAMPP por defecto)
$host = 'localhost';
$db   = 'detodop8_gestion_monitores';
$user = 'detodop8_monitor';
$pass = 'tj{kASv3riDb';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Error de conexión a MySQL. ¿Iniciaste XAMPP y creaste la DB?']);
    exit;
}

$action = $_POST['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'login':
        $cedula = $_POST['cedula'];
        $password = $_POST['password'];

        $stmt = $pdo->prepare("SELECT * FROM usuarios WHERE cedula = ? AND password = ?");
        $stmt->execute([$cedula, $password]);
        $userData = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($userData) {
            if (isset($userData['estado_cuenta']) && $userData['estado_cuenta'] === 'pendiente') {
                echo json_encode(['success' => false, 'message' => 'Tu cuenta está pendiente de aprobación por un administrador.']);
            } else if (isset($userData['estado_cuenta']) && $userData['estado_cuenta'] === 'rechazado') {
                echo json_encode(['success' => false, 'message' => 'Tu solicitud de cuenta ha sido rechazada.']);
            } else {
                echo json_encode(['success' => true, 'user' => $userData]);
            }
        } else {
            echo json_encode(['success' => false, 'message' => 'Cédula o contraseña incorrectos.']);
        }
        break;

    case 'get_state':
        $user_id = $_POST['user_id'] ?? null;
        $is_demo = false;
        if ($user_id) {
            $stmt = $pdo->prepare("SELECT cedula FROM usuarios WHERE id = ?");
            $stmt->execute([$user_id]);
            $u = $stmt->fetch();
            if ($u && $u['cedula'] === '987654321') {
                $is_demo = true;
            }
        }
        
        $demo_id = null;
        $demoStmt = $pdo->query("SELECT id FROM usuarios WHERE cedula = '987654321'");
        $demoUser = $demoStmt->fetch();
        if ($demoUser) {
            $demo_id = $demoUser['id'];
        }
        
        if ($is_demo) {
            $users = $pdo->prepare("SELECT * FROM usuarios WHERE creado_por = ? OR id = ?");
            $users->execute([$user_id, $user_id]);
            $users = $users->fetchAll(PDO::FETCH_ASSOC);

            $rooms = $pdo->prepare("SELECT * FROM salas WHERE creado_por = ?");
            $rooms->execute([$user_id]);
            $rooms = $rooms->fetchAll(PDO::FETCH_ASSOC);

            $schedules = $pdo->prepare("SELECT h.* FROM horarios h JOIN salas s ON h.sala_id = s.id WHERE s.creado_por = ?");
            $schedules->execute([$user_id]);
            $schedules = $schedules->fetchAll(PDO::FETCH_ASSOC);

            $assignments = $pdo->prepare("SELECT a.* FROM asignaciones a JOIN usuarios u ON a.monitor_id = u.id WHERE u.creado_por = ?");
            $assignments->execute([$user_id]);
            $assignments = $assignments->fetchAll(PDO::FETCH_ASSOC);

            $shiftRequests = $pdo->prepare("SELECT r.* FROM solicitudes_cambio r JOIN asignaciones a ON r.asignacion_id = a.id JOIN usuarios u ON a.monitor_id = u.id WHERE u.creado_por = ?");
            $shiftRequests->execute([$user_id]);
            $shiftRequests = $shiftRequests->fetchAll(PDO::FETCH_ASSOC);
        } else {
            if ($demo_id) {
                $users = $pdo->prepare("SELECT * FROM usuarios WHERE (creado_por IS NULL OR creado_por != ?) AND id != ?");
                $users->execute([$demo_id, $demo_id]);
                $users = $users->fetchAll(PDO::FETCH_ASSOC);

                $rooms = $pdo->prepare("SELECT * FROM salas WHERE creado_por IS NULL OR creado_por != ?");
                $rooms->execute([$demo_id]);
                $rooms = $rooms->fetchAll(PDO::FETCH_ASSOC);

                $schedules = $pdo->prepare("SELECT h.* FROM horarios h JOIN salas s ON h.sala_id = s.id WHERE s.creado_por IS NULL OR s.creado_por != ?");
                $schedules->execute([$demo_id]);
                $schedules = $schedules->fetchAll(PDO::FETCH_ASSOC);

                $assignments = $pdo->prepare("SELECT a.* FROM asignaciones a JOIN usuarios u ON a.monitor_id = u.id WHERE u.creado_por IS NULL OR u.creado_por != ?");
                $assignments->execute([$demo_id]);
                $assignments = $assignments->fetchAll(PDO::FETCH_ASSOC);

                $shiftRequests = $pdo->prepare("SELECT r.* FROM solicitudes_cambio r JOIN asignaciones a ON r.asignacion_id = a.id JOIN usuarios u ON a.monitor_id = u.id WHERE u.creado_por IS NULL OR u.creado_por != ?");
                $shiftRequests->execute([$demo_id]);
                $shiftRequests = $shiftRequests->fetchAll(PDO::FETCH_ASSOC);
            } else {
                $users = $pdo->query("SELECT * FROM usuarios")->fetchAll(PDO::FETCH_ASSOC);
                $rooms = $pdo->query("SELECT * FROM salas")->fetchAll(PDO::FETCH_ASSOC);
                $schedules = $pdo->query("SELECT * FROM horarios")->fetchAll(PDO::FETCH_ASSOC);
                $assignments = $pdo->query("SELECT * FROM asignaciones")->fetchAll(PDO::FETCH_ASSOC);
                $shiftRequests = $pdo->query("SELECT * FROM solicitudes_cambio")->fetchAll(PDO::FETCH_ASSOC);
            }
        }

        echo json_encode([
            'success' => true,
            'state' => [
                'users' => $users,
                'rooms' => $rooms,
                'schedules' => $schedules,
                'assignments' => $assignments,
                'shiftRequests' => $shiftRequests
            ]
        ]);
        break;

    case 'register_monitor':
        $config = file_exists('config.json') ? json_decode(file_get_contents('config.json'), true) : ['registrations_enabled' => true];
        if (!$config['registrations_enabled']) {
            echo json_encode(['success' => false, 'message' => 'Las inscripciones están actualmente cerradas por el administrador.']);
            exit;
        }

        $nombre = $_POST['name'];
        $cedula = $_POST['cedula'];
        $password = $_POST['password'];
        $promedio = $_POST['promedio'];
        $correo = $_POST['correo'];
        $disponibilidad = $_POST['disponibilidad']; // JSON string
        $celular = $_POST['celular'] ?? '';
        $programa = $_POST['programa'] ?? '';
        $rol = 'monitor';
        $estado_cuenta = 'pendiente';

        if ((float)$promedio < 3.5 || (float)$promedio > 5.0) {
            echo json_encode(['success' => false, 'message' => 'El promedio debe estar entre 3.5 y 5.0.']);
            exit;
        }

        // Validar si la cédula ya existe
        $stmt = $pdo->prepare("SELECT id FROM usuarios WHERE cedula = ?");
        $stmt->execute([$cedula]);
        if ($stmt->fetch()) {
            echo json_encode(['success' => false, 'message' => 'La cédula ya se encuentra registrada en el sistema.']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO usuarios (nombre, cedula, password, rol, promedio, correo, disponibilidad, estado_cuenta, celular, programa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        if ($stmt->execute([$nombre, $cedula, $password, $rol, $promedio, $correo, $disponibilidad, $estado_cuenta, $celular, $programa])) {
            echo json_encode(['success' => true, 'message' => 'Registro completado. Espera la aprobación del administrador.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Hubo un problema al registrar la cuenta.']);
        }
        break;

    case 'add_user':
        $nombre = $_POST['name'];
        $cedula = $_POST['cedula'];
        $password = $_POST['password'];
        $rol = $_POST['role'];
        $creado_por = $_POST['creado_por'] ?? null;

        if ($creado_por && $rol === 'admin') {
            $checkDemo = $pdo->prepare("SELECT cedula FROM usuarios WHERE id = ?");
            $checkDemo->execute([$creado_por]);
            $creator = $checkDemo->fetch();
            if ($creator && $creator['cedula'] === '987654321') {
                echo json_encode(['success' => false, 'message' => 'La cuenta demo no tiene permisos para crear administradores.']);
                exit;
            }
        }

        // Validar si la cédula ya existe
        $stmt = $pdo->prepare("SELECT id FROM usuarios WHERE cedula = ?");
        $stmt->execute([$cedula]);
        if ($stmt->fetch()) {
            echo json_encode(['success' => false, 'message' => 'La cédula ya se encuentra registrada en el sistema.']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO usuarios (nombre, cedula, password, rol, estado_cuenta, creado_por) VALUES (?, ?, ?, ?, 'aprobado', ?)");
        if ($stmt->execute([$nombre, $cedula, $password, $rol, $creado_por])) {
            echo json_encode(['success' => true, 'message' => 'El usuario ha sido registrado exitosamente.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Hubo un problema al registrar el usuario.']);
        }
        break;

    case 'delete_user':
        $id = $_POST['id'];
        $stmt = $pdo->prepare("DELETE FROM usuarios WHERE id = ?");
        if ($stmt->execute([$id])) {
            echo json_encode(['success' => true, 'message' => 'Usuario revocado exitosamente.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'No se pudo eliminar el usuario.']);
        }
        break;

    case 'update_user_status':
        $id = $_POST['id'];
        $status = $_POST['status']; // 'aprobado' or 'rechazado'
        
        $stmt = $pdo->prepare("UPDATE usuarios SET estado_cuenta = ? WHERE id = ?");
        if ($stmt->execute([$status, $id])) {
            echo json_encode(['success' => true, 'message' => 'Estado del usuario actualizado a ' . $status . '.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error al actualizar el usuario.']);
        }
        break;

    case 'accept_replacement':
        $id = $_POST['id'];
        $accepted = $_POST['accepted'] === '1';

        if ($accepted) {
            // Reemplazo acepta: marcamos reemplazo_acepto=1, estado sigue 'pendiente' (para el admin)
            $stmt = $pdo->prepare("UPDATE solicitudes_cambio SET reemplazo_acepto = 1 WHERE id = ? AND reemplazo_acepto = 0 AND estado NOT IN ('aprobada','rechazada')");
            if ($stmt->execute([$id]) && $stmt->rowCount() > 0) {
                echo json_encode(['success' => true, 'message' => 'Confirmaste el reemplazo. El administrador tomará la decisión final.']);
            } else {
                echo json_encode(['success' => false, 'message' => 'No se pudo actualizar. Puede que ya haya sido procesada.']);
            }
        } else {
            // Reemplazo rechaza: se cierra la solicitud
            $stmt = $pdo->prepare("UPDATE solicitudes_cambio SET reemplazo_acepto = 0, estado = 'rechazada' WHERE id = ? AND estado NOT IN ('aprobada','rechazada')");
            if ($stmt->execute([$id]) && $stmt->rowCount() > 0) {
                echo json_encode(['success' => true, 'message' => 'Rechazaste el reemplazo.']);
            } else {
                echo json_encode(['success' => false, 'message' => 'No se pudo actualizar.']);
            }
        }
        break;

    case 'update_request_status':
        $id = $_POST['id'];
        $status = $_POST['status']; // 'aprobada' or 'rechazada'

        // Admin solo puede actuar si reemplazo_acepto = 1
        $check = $pdo->prepare("SELECT reemplazo_acepto, estado FROM solicitudes_cambio WHERE id = ?");
        $check->execute([$id]);
        $current = $check->fetch();
        if (!$current || $current['reemplazo_acepto'] != 1 || $current['estado'] !== 'pendiente') {
            echo json_encode(['success' => false, 'message' => 'Esta solicitud aún no fue confirmada por el monitor de reemplazo.']);
            break;
        }

        $stmt = $pdo->prepare("UPDATE solicitudes_cambio SET estado = ? WHERE id = ?");
        if ($stmt->execute([$status, $id])) {
// AHORA: solo marca como aprobada, NO toca la asignación
// (el reemplazo se resuelve por fecha en el frontend)
            echo json_encode(['success' => true, 'message' => 'Solicitud actualizada correctamente.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error al actualizar la solicitud.']);
        }
        break;

case 'add_shift_request':
    $asignacion_id = $_POST['asignacion_id'];
    $solicitante_id = $_POST['solicitante_id'];
    $reemplazo_id = $_POST['reemplazo_id'];
    $motivo = $_POST['motivo'];

    // Obtener el día de la semana del horario de esta asignación
    $schedQuery = $pdo->prepare("
        SELECT h.dia FROM asignaciones a
        JOIN horarios h ON a.horario_id = h.id
        WHERE a.id = ?
    ");
    $schedQuery->execute([$asignacion_id]);
    $schedRow = $schedQuery->fetch();

    // Calcular la fecha del próximo día correspondiente (o hoy si es hoy)
    $diasMap = ['Domingo'=>0,'Lunes'=>1,'Martes'=>2,'Miércoles'=>3,'Jueves'=>4,'Viernes'=>5,'Sábado'=>6];
    $diaObjetivo = $diasMap[$schedRow['dia']] ?? date('w');
    $hoyNum = (int)date('w');
    $diff = ($diaObjetivo - $hoyNum + 7) % 7;
    $fecha_reemplazo = date('Y-m-d', strtotime("+{$diff} days"));

    $stmt = $pdo->prepare("INSERT INTO solicitudes_cambio (asignacion_id, monitor_solicitante_id, monitor_reemplazo_id, motivo, estado, reemplazo_acepto, fecha_reemplazo) VALUES (?, ?, ?, ?, 'pendiente', 0, ?)");
    if ($stmt->execute([$asignacion_id, $solicitante_id, $reemplazo_id, $motivo, $fecha_reemplazo])) {
        echo json_encode(['success' => true, 'message' => 'Solicitud enviada. El monitor de reemplazo debe confirmar primero.']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Error al enviar la solicitud.']);
    }
    break;

    case 'add_room':
        $nombre = $_POST['name'];
        $ubicacion = $_POST['location'];
        $capacidad = $_POST['capacity'];
        $open_time = $_POST['open_time'];
        $close_time = $_POST['close_time'];
        $creado_por = $_POST['creado_por'] ?? null;

        $stmt = $pdo->prepare("INSERT INTO salas (nombre, ubicacion, capacidad, hora_apertura, hora_cierre, creado_por) VALUES (?, ?, ?, ?, ?, ?)");
        if ($stmt->execute([$nombre, $ubicacion, $capacidad, $open_time, $close_time, $creado_por])) {
            echo json_encode(['success' => true, 'message' => 'Sala agregada exitosamente.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error al agregar la sala.']);
        }
        break;

    case 'add_schedule':
        $sala_id = $_POST['room_id'];
        $dia = $_POST['day'];
        $hora_inicio = $_POST['start_time'];
        $hora_fin = $_POST['end_time'];

        $stmt = $pdo->prepare("INSERT INTO horarios (sala_id, dia, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)");
        if ($stmt->execute([$sala_id, $dia, $hora_inicio, $hora_fin])) {
            echo json_encode(['success' => true, 'message' => 'Horario asignado a la sala.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error al asignar el horario.']);
        }
        break;

case 'add_assignment':
    $sala_id    = $_POST['room_id'];
    $monitor_id = $_POST['monitor_id'];
    $dia        = $_POST['day'];
    $hora_inicio = $_POST['start_time'];
    $hora_fin    = $_POST['end_time'];

    // Validar que el turno esté dentro del horario de la sala
    $salaCheck = $pdo->prepare("SELECT hora_apertura, hora_cierre FROM salas WHERE id = ?");
    $salaCheck->execute([$sala_id]);
    $sala = $salaCheck->fetch();
    if ($sala && (substr($hora_inicio, 0, 5) < substr($sala['hora_apertura'], 0, 5) || substr($hora_fin, 0, 5) > substr($sala['hora_cierre'], 0, 5))) {
        echo json_encode(['success' => false, 'message' => 'El turno está fuera del horario de apertura de la sala.']);
        break;
    }

    try {
        $pdo->beginTransaction();

        // ✅ Verificar si ya existe un monitor en esa sala, ese día, en ese rango horario
        $check = $pdo->prepare("
            SELECT u.nombre
            FROM asignaciones a
            JOIN horarios h ON a.horario_id = h.id
            JOIN usuarios u ON a.monitor_id = u.id
            WHERE h.sala_id    = ?
              AND h.dia        = ?
              AND h.hora_inicio < ?
              AND h.hora_fin   > ?
            LIMIT 1
        ");
        $check->execute([$sala_id, $dia, $hora_fin, $hora_inicio]);
        $conflicto = $check->fetch();

        if ($conflicto) {
            $pdo->rollBack();
            echo json_encode([
                'success' => false,
                'message' => 'Conflicto de horario: ' . $conflicto['nombre'] . ' ya está asignado en esa sala ese día en ese rango.'
            ]);
            break;
        }
        

        // Sin conflicto — insertar horario y asignación
        $stmt = $pdo->prepare("INSERT INTO horarios (sala_id, dia, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)");
        $stmt->execute([$sala_id, $dia, $hora_inicio, $hora_fin]);
        $horario_id = $pdo->lastInsertId();

        $stmt = $pdo->prepare("INSERT INTO asignaciones (horario_id, monitor_id) VALUES (?, ?)");
        $stmt->execute([$horario_id, $monitor_id]);

        $pdo->commit();
        echo json_encode(['success' => true, 'message' => 'Monitor asignado a la sala exitosamente.']);

    } catch(Exception $e) {
        $pdo->rollBack();
        echo json_encode(['success' => false, 'message' => 'Error al asignar el monitor.']);
    }
    break;

    case 'delete_assignment':
        $id = $_POST['id'];
        $stmt = $pdo->prepare("DELETE FROM asignaciones WHERE id = ?");
        if ($stmt->execute([$id])) {
            echo json_encode(['success' => true, 'message' => 'Asignación removida exitosamente.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'No se pudo remover la asignación.']);
        }
        break;

    case 'delete_room':
        $id = $_POST['id'];
        $stmt = $pdo->prepare("DELETE FROM salas WHERE id = ?");
        if ($stmt->execute([$id])) {
            echo json_encode(['success' => true, 'message' => 'Sala eliminada exitosamente.']);
        } else {
            echo json_encode(['success' => false, 'message' => 'No se pudo eliminar la sala.']);
        }
        break;

    case 'get_settings':
        $config = file_exists('config.json') ? json_decode(file_get_contents('config.json'), true) : ['registrations_enabled' => true];
        echo json_encode(['success' => true, 'config' => $config]);
        break;

    case 'update_settings':
        $enabled = $_POST['registrations_enabled'] === 'true';
        file_put_contents('config.json', json_encode(['registrations_enabled' => $enabled]));
        echo json_encode(['success' => true, 'message' => 'Configuración actualizada']);
        break;

    case 'delete_rejected_users':
        $stmt = $pdo->prepare("DELETE FROM usuarios WHERE estado_cuenta = 'rechazado'");
        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'message' => 'Solicitudes rechazadas eliminadas']);
        } else {
            echo json_encode(['success' => false, 'message' => 'Error al limpiar solicitudes']);
        }
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Acción no válida.']);
        break;
}

/*
 * ============================================================
 * UTPSync - API REST Backend
 * ============================================================
 * Este archivo actúa como el único punto de entrada (Single Endpoint) 
 * para todas las peticiones del frontend (app.js).
 * 
 * Responsabilidades principales:
 * - Autenticación y gestión de estado de los usuarios.
 * - Sincronización del estado global (get_state) para el Dashboard.
 * - Operaciones CRUD (Crear, Leer, Actualizar, Eliminar) para:
 *   > Usuarios y solicitudes de registro de Monitores.
 *   > Infraestructura de salas de cómputo y sus horarios.
 *   > Asignación de turnos a Monitores.
 *   > Flujo completo de solicitudes de cambio de turno.
 * - Lectura y escritura de configuraciones (config.json).
 * 
 * Arquitectura y Seguridad:
 * - Utiliza sentencias preparadas (PDO) para evitar inyección SQL.
 * - Las peticiones se enrutan dinámicamente mediante la variable 
 *   'action' enviada por POST o GET a través de un switch-case.
 * 
 * EN RESUMEN (Para no programadores):
 * Este archivo es el "cerebro" y el "mensajero" del sistema. Recibe las 
 * peticiones de la página web (ej. "quiero iniciar sesión", "crea un 
 * nuevo turno", "aprueba a este monitor"), va a la base de datos a guardar 
 * o buscar esa información, y luego le devuelve la respuesta a la página 
 * web para que el usuario pueda verla.
 * ============================================================
 */
?>
