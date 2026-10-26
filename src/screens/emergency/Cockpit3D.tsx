import { Html, OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, type ReactNode } from 'react';
import type { Group, Mesh, MeshStandardMaterial, PointLight } from 'three';

interface Props {
  spinDegS: number;
  alarm: boolean;
  /** Pantallas de la cabina: izquierda, centro, derecha y superior */
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  top: ReactNode;
}

const EYE: [number, number, number] = [0, 1.2, 0];
/** Distancia de las pantallas a los ojos del jugador */
const SCREEN_R = 1.05;
/** Escala del HTML en la escena: 400 px de pantalla = DISTANCE_FACTOR unidades */
const DISTANCE_FACTOR = 0.65;
const DEG = Math.PI / 180;

/** Coloca una pantalla alrededor de los ojos (azimut a la derecha, elevación hacia arriba) mirando al jugador */
function around(azDeg: number, elDeg: number) {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  return {
    position: [EYE[0] + SCREEN_R * Math.sin(az) * Math.cos(el), EYE[1] + SCREEN_R * Math.sin(el), EYE[2] - SCREEN_R * Math.cos(az) * Math.cos(el)] as [number, number, number],
    rotation: [el, -az, 0] as [number, number, number],
  };
}
/** El giro real (3 °/s) se exagera para que se note en pantalla */
const SPIN_VISUAL = 4;
const HULL = '#26324a';
const TRIM = '#34405c';

/**
 * Cabina en primera persona "sentado": la cámara no se mueve, solo gira la mirada.
 * Las pantallas son HTML real dentro de la escena, así que los botones funcionan como en 2D.
 */
export default function Cockpit3D({ spinDegS, alarm, left, center, right, top }: Props) {
  return (
    <Canvas camera={{ position: [EYE[0], EYE[1], EYE[2] + 0.01], fov: 60, near: 0.01, far: 500 }} dpr={[1, 2]}>
      <color attach="background" args={['#02030a']} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#9fb8ff', '#1a1020', 0.5]} />
      <directionalLight position={[3, 4, 2]} intensity={0.6} />
      <AlarmLight on={alarm} />
      <Space spinDegS={spinDegS} />
      <Shell />

      <Screen {...around(-48, -6)}>{left}</Screen>
      <Screen {...around(0, -22)}>{center}</Screen>
      <Screen {...around(48, -6)}>{right}</Screen>
      <Screen {...around(0, 27)} small>
        {top}
      </Screen>

      <OrbitControls
        target={EYE}
        enablePan={false}
        enableZoom={false}
        // Sin inercia: si la vista sigue deslizándose al soltar, la pantalla se mueve bajo el cursor y el clic se pierde
        enableDamping={false}
        rotateSpeed={-0.35}
        minPolarAngle={Math.PI * 0.22}
        maxPolarAngle={Math.PI * 0.78}
        minAzimuthAngle={-Math.PI * 0.45}
        maxAzimuthAngle={Math.PI * 0.45}
      />
    </Canvas>
  );
}

/** Pantalla con marco: el HTML va un poco por delante del bisel */
function Screen({ position, rotation, children, small }: { position: [number, number, number]; rotation: [number, number, number]; children: ReactNode; small?: boolean }) {
  // Tamaño del bisel = tamaño del panel HTML (360×420 o 420×175 px) en unidades de la escena
  const px = DISTANCE_FACTOR / 400;
  const w = (small ? 420 : 360) * px;
  const h = (small ? 175 : 420) * px;
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[w + 0.06, h + 0.06, 0.02]} />
        <meshStandardMaterial color={TRIM} metalness={0.5} roughness={0.5} />
      </mesh>
      <Html
        transform
        distanceFactor={DISTANCE_FACTOR}
        position={[0, 0, 0.002]}
        zIndexRange={[10, 1]}
        className={small ? 'cp-html small' : 'cp-html'}
      >
        {/* Las pantallas viven dentro del mismo contenedor que escuchan los controles de cámara: si el
            pointerdown les llega, capturan el puntero y el clic termina en el contenedor, no en el botón */}
        <div onPointerDown={(e) => e.stopPropagation()}>{children}</div>
      </Html>
    </group>
  );
}

/** Estructura de la cabina con un ventanal al frente */
function Shell() {
  const box = (pos: [number, number, number], size: [number, number, number], rot: [number, number, number] = [0, 0, 0], color = HULL) => (
    <mesh position={pos} rotation={rot}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={0.35} roughness={0.75} />
    </mesh>
  );
  return (
    <group>
      {/* Piso y techo */}
      {box([0, 0.05, -0.4], [3.2, 0.1, 2.6])}
      {box([0, 2.35, -0.4], [3.2, 0.1, 2.6])}
      {/* Consola bajo la pantalla central */}
      {box([0, 0.45, -1.05], [1.6, 0.8, 0.5], [0, 0, 0], TRIM)}
      {/* Marco del ventanal: travesaños y columnas */}
      {box([0, 2.12, -1.35], [2.6, 0.36, 0.08])}
      {box([0, 0.98, -1.35], [2.6, 0.14, 0.08])}
      {box([-1.18, 1.55, -1.35], [0.24, 1.3, 0.08])}
      {box([1.18, 1.55, -1.35], [0.24, 1.3, 0.08])}
      {box([0, 1.55, -1.35], [0.06, 1.1, 0.06], [0, 0, 0], TRIM)}
      {/* Paredes laterales en ángulo */}
      {box([-1.45, 1.2, -0.55], [0.08, 2.3, 1.7], [0, 0.35, 0])}
      {box([1.45, 1.2, -0.55], [0.08, 2.3, 1.7], [0, -0.35, 0])}
    </group>
  );
}

/** Lo que se ve por el ventanal: estrellas, el Sol y Marte, girando con la nave */
function Space({ spinDegS }: { spinDegS: number }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += ((spinDegS * SPIN_VISUAL * Math.PI) / 180) * dt;
  });
  return (
    <group ref={ref}>
      <Stars radius={80} depth={40} count={5000} factor={3} fade speed={0} />
      <mesh position={[-30, 12, -60]}>
        <sphereGeometry args={[2.2, 32, 32]} />
        <meshBasicMaterial color="#fff2b0" />
      </mesh>
      <mesh position={[-30, 12, -60]}>
        <sphereGeometry args={[4.5, 32, 32]} />
        <meshBasicMaterial color="#ffcf5a" transparent opacity={0.18} />
      </mesh>
      <mesh position={[40, -6, -70]}>
        <sphereGeometry args={[1.6, 32, 32]} />
        <meshStandardMaterial color="#c4552f" roughness={1} emissive="#3a1206" />
      </mesh>
    </group>
  );
}

/** Luz roja que parpadea mientras haya alarmas */
function AlarmLight({ on }: { on: boolean }) {
  const light = useRef<PointLight>(null);
  const bulb = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const pulse = on ? (Math.sin(clock.elapsedTime * 6) + 1) / 2 : 0;
    if (light.current) light.current.intensity = pulse * 2.5;
    if (bulb.current) (bulb.current.material as MeshStandardMaterial).emissiveIntensity = on ? 0.4 + pulse * 2 : 0.05;
  });
  return (
    <group position={[0, 2.22, -1.0]}>
      <pointLight ref={light} color="#ff2a2a" distance={4} />
      <mesh ref={bulb}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial color="#ff3b3b" emissive="#ff2a2a" emissiveIntensity={0.05} />
      </mesh>
    </group>
  );
}
