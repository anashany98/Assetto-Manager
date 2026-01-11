import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import * as THREE from 'three';

interface ReplayPoint {
    t: number;
    x: number;
    y: number;
    z: number;
    rot: number;
    s: number;
}

interface GhostViewerProps {
    data: ReplayPoint[];
    isPlaying: boolean;
    progress: number; // 0 to 1
}

function CarModel({ position, rotation }: { position: [number, number, number], rotation: [number, number, number] }) {
    return (
        <group position={position} rotation={rotation}>
            {/* Body */}
            <mesh position={[0, 0.5, 0]} castShadow>
                <boxGeometry args={[1.8, 0.8, 4.5]} />
                <meshStandardMaterial color="red" metalness={0.6} roughness={0.2} />
            </mesh>
            {/* Cabin */}
            <mesh position={[0, 1.0, -0.5]}>
                <boxGeometry args={[1.6, 0.6, 2]} />
                <meshStandardMaterial color="#333" />
            </mesh>
            {/* Spoile r*/}
            <mesh position={[0, 0.9, 2.1]}>
                <boxGeometry args={[1.8, 0.1, 0.5]} />
                <meshStandardMaterial color="black" />
            </mesh>
        </group>
    );
}

function TrackPath({ points }: { points: ReplayPoint[] }) {
    const lineGeometry = useMemo(() => {
        const curve = new THREE.CatmullRomCurve3(
            points.map(p => new THREE.Vector3(p.x, p.y, p.z))
        );
        return new THREE.TubeGeometry(curve, points.length, 0.5, 8, false);
    }, [points]);

    return (
        <mesh geometry={lineGeometry} position={[0, 0.1, 0]}>
            <meshBasicMaterial color="gray" opacity={0.3} transparent />
        </mesh>
    );
}

function Scene({ data, progress }: GhostViewerProps) {
    const cameraRef = useRef<THREE.PerspectiveCamera>(null);

    // Calculate current position based on progress
    const idx = Math.floor(progress * (data.length - 1));
    const nextIdx = Math.min(idx + 1, data.length - 1);
    const subProgress = (progress * (data.length - 1)) - idx;

    const currentPoint = data[idx] || data[0];
    const nextPoint = data[nextIdx] || currentPoint;

    // Interpolate
    const x = THREE.MathUtils.lerp(currentPoint.x, nextPoint.x, subProgress);
    const y = THREE.MathUtils.lerp(currentPoint.y, nextPoint.y, subProgress);
    const z = THREE.MathUtils.lerp(currentPoint.z, nextPoint.z, subProgress);
    const rot = THREE.MathUtils.lerp(currentPoint.rot, nextPoint.rot, subProgress);

    useFrame(() => {
        if (cameraRef.current) {
            // Camera Follow Logic
            const targetPos = new THREE.Vector3(x, y + 2, z); // Above car
            const offset = new THREE.Vector3(0, 5, -10).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot); // Behind car

            // Smooth camera movement
            cameraRef.current.position.lerp(targetPos.add(offset), 0.1);
            cameraRef.current.lookAt(x, y, z);
        }
    });

    return (
        <>
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
            <Grid args={[100, 100]} cellSize={1} cellThickness={0.5} sectionSize={5} sectionThickness={1} fadeDistance={50} />

            <TrackPath points={data} />

            {/* The Car */}
            <CarModel position={[x, y, z]} rotation={[0, rot + Math.PI, 0]} />

            <PerspectiveCamera makeDefault ref={cameraRef} position={[0, 10, 10]} />
            <OrbitControls target={[x, y, z]} />
        </>
    );
}

export default function GhostViewer({ data, isOpen, onClose }: { data: ReplayPoint[], isOpen: boolean, onClose: () => void }) {
    const [progress, setProgress] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);

    useEffect(() => {
        if (!isPlaying || !isOpen) return;
        const interval = setInterval(() => {
            setProgress(p => {
                if (p >= 1) return 0;
                return p + 0.005; // ~200 steps loop
            });
        }, 33);
        return () => clearInterval(interval);
    }, [isPlaying, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
            <div className="h-14 flex items-center justify-between px-4 bg-gray-900 border-b border-gray-800">
                <span className="font-bold text-white">Replay 3D</span>
                <button onClick={onClose} className="text-white bg-red-600 px-3 py-1 rounded">Cerrar</button>
            </div>

            <div className="flex-1 relative">
                <Canvas shadows>
                    <Scene data={data} isPlaying={isPlaying} progress={progress} />
                </Canvas>

                {/* Controls Overlay */}
                <div className="absolute bottom-8 left-0 w-full px-8 flex flex-col gap-2">
                    <input
                        type="range"
                        min="0" max="1" step="0.001"
                        value={progress}
                        onChange={(e) => {
                            setIsPlaying(false);
                            setProgress(parseFloat(e.target.value));
                        }}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-center">
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="bg-blue-600 text-white px-6 py-2 rounded-full shadow-lg font-bold"
                        >
                            {isPlaying ? "PAUSE" : "PLAY"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
