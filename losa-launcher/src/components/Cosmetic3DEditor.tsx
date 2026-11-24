import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type Cosmetic3DChanges = {
  model?: string;
  texture?: string;
  positionX?: number;
  positionY?: number;
  positionZ?: number;
  scale?: number;
  rotationY?: number;
  animation?: string;
};

type Props = {
  modelData: string;
  textureData: string;
  category: string;
  positionX: number;
  positionY: number;
  positionZ: number;
  scale: number;
  rotationY: number;
  animation: string;
  onChange: (changes: Cosmetic3DChanges) => void;
  onModelFile: (file?: File) => void;
  onTextureFile: (file?: File) => void;
};

export function Cosmetic3DEditor(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let frame = 0;
    let loadedRoot: THREE.Object3D | null = null;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(3.1, 2.35, 4.5);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      host.innerHTML = '<div class="cosmetic-3d-fallback">3D-просмотр недоступен: проверь поддержку WebGL и драйвер видеокарты.</div>';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "cosmetic-3d-canvas";
    host.appendChild(renderer.domElement);

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    scene.add(new THREE.HemisphereLight(0xe5efff, 0x554b42, 2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(3.5, 5, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x8ab7ff, 1.1);
    rimLight.position.set(-3, 2, -3);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 64),
      new THREE.MeshStandardMaterial({ color: 0x273139, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.03;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(4, 20, 0x64717a, 0x46525a);
    grid.position.y = -0.02;
    scene.add(grid);

    const mannequin = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xc89d78, roughness: 0.78 });
    const clothing = new THREE.MeshStandardMaterial({ color: 0x536c82, roughness: 0.82 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x303b4b, roughness: 0.9 });
    const addPart = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale?: [number, number, number]) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      if (scale) mesh.scale.set(...scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mannequin.add(mesh);
      return mesh;
    };
    addPart(new THREE.CylinderGeometry(0.29, 0.34, 0.72, 12), clothing, [0, 0.84, 0]);
    addPart(new THREE.SphereGeometry(0.235, 20, 16), skin, [0, 1.42, 0]);
    addPart(new THREE.CylinderGeometry(0.105, 0.12, 0.58, 10), clothing, [-0.39, 0.86, 0], [1, 1, 0.9]);
    addPart(new THREE.CylinderGeometry(0.105, 0.12, 0.58, 10), clothing, [0.39, 0.86, 0], [1, 1, 0.9]);
    addPart(new THREE.CylinderGeometry(0.13, 0.14, 0.68, 10), pants, [-0.16, 0.2, 0]);
    addPart(new THREE.CylinderGeometry(0.13, 0.14, 0.68, 10), pants, [0.16, 0.2, 0]);
    scene.add(mannequin);

    const anchor = new THREE.Group();
    if (props.category === "Головные уборы") anchor.position.set(0, 1.68, 0);
    else if (props.category === "Плащи") anchor.position.set(0, 0.82, -0.29);
    else if (props.category === "Питомцы") anchor.position.set(0.58, 0.22, 0.22);
    else if (props.category === "Ауры") anchor.position.set(0, 0.85, 0);
    else anchor.position.set(0, 0.88, 0.32);
    scene.add(anchor);

    const itemGroup = new THREE.Group();
    anchor.add(itemGroup);
    const placeholderMaterial = new THREE.MeshStandardMaterial({ color: 0xd7b86b, metalness: 0.25, roughness: 0.42 });
    const placeholder = new THREE.Mesh(
      props.category === "Плащи"
        ? new THREE.BoxGeometry(0.68, 0.82, 0.055)
        : props.category === "Головные уборы"
          ? new THREE.TorusGeometry(0.24, 0.075, 10, 28)
          : props.category === "Питомцы"
            ? new THREE.IcosahedronGeometry(0.27, 1)
            : new THREE.OctahedronGeometry(0.29, 1),
      placeholderMaterial,
    );
    placeholder.position.y = props.category === "Головные уборы" ? 0.05 : 0;
    placeholder.castShadow = true;
    itemGroup.add(placeholder);

    if (props.modelData) {
      new GLTFLoader().load(
        props.modelData,
        gltf => {
          if (disposed) return;
          itemGroup.remove(placeholder);
          loadedRoot = gltf.scene;
          const bounds = new THREE.Box3().setFromObject(loadedRoot);
          const size = bounds.getSize(new THREE.Vector3());
          const maxAxis = Math.max(size.x, size.y, size.z) || 1;
          loadedRoot.scale.setScalar(0.72 / maxAxis);
          const centered = bounds.getCenter(new THREE.Vector3());
          loadedRoot.position.set(-centered.x * loadedRoot.scale.x, -centered.y * loadedRoot.scale.y, -centered.z * loadedRoot.scale.z);
          loadedRoot.traverse(object => {
            if (object instanceof THREE.Mesh) {
              object.castShadow = true;
              object.receiveShadow = true;
            }
          });
          itemGroup.add(loadedRoot);
          if (props.textureData) applyTexture(props.textureData, loadedRoot);
        },
        undefined,
        () => {
          if (!disposed) host.dataset.modelError = "true";
        },
      );
    } else if (props.textureData) {
      applyTexture(props.textureData, itemGroup);
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.92, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 2.3;
    controls.maxDistance = 8;
    controls.maxPolarAngle = Math.PI * 0.88;

    itemGroup.position.set(props.positionX, props.positionY, props.positionZ);
    itemGroup.scale.setScalar(props.scale);
    itemGroup.rotation.y = THREE.MathUtils.degToRad(props.rotationY);

    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const current = propsRef.current;
      itemGroup.position.set(
        current.positionX,
        current.positionY + (current.animation === "bob" ? Math.sin(elapsed * 2.3) * 0.08 : 0),
        current.positionZ,
      );
      itemGroup.rotation.y = THREE.MathUtils.degToRad(current.rotationY) + (current.animation === "spin" ? elapsed * 0.9 : 0);
      const pulse = current.animation === "pulse" ? 1 + Math.sin(elapsed * 3) * 0.08 : 1;
      itemGroup.scale.setScalar(current.scale * pulse);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      void loadedRoot;
    };
  }, [props.modelData, props.textureData, props.category]);

  return (
    <div className="cosmetic-3d-editor">
      <div className="cosmetic-3d-viewer">
        <div className="cosmetic-3d-label">3D ПРЕДПРОСМОТР · ПЕРЕТАСКИВАЙ ДЛЯ ВРАЩЕНИЯ</div>
        <div className="cosmetic-3d-host" ref={hostRef} />
      </div>
      <div className="cosmetic-3d-tools">
        <div className="cosmetic-3d-tools-head"><b>Модель и текстура</b><small>GLB · PNG · JPG · WEBP</small></div>
        <div className="cosmetic-3d-upload-row">
          <label className="workshop-upload"><span>{props.modelData ? "Заменить 3D-модель" : "Загрузить 3D-модель"}</span><small>Формат GLB · до 8 МБ<input type="file" accept=".glb,model/gltf-binary" onChange={event => props.onModelFile(event.target.files?.[0])}/></small></label>
          <label className="workshop-upload"><span>{props.textureData ? "Заменить текстуру" : "Загрузить текстуру"}</span><small>PNG/JPG/WEBP · до 4 МБ<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => props.onTextureFile(event.target.files?.[0])}/></small></label>
        </div>
        {(props.modelData || props.textureData) && <div className="cosmetic-3d-file-actions">{props.modelData && <button className="text-action" onClick={() => props.onChange({ model: "" })}>Удалить модель</button>}{props.textureData && <button className="text-action" onClick={() => props.onChange({ texture: "" })}>Удалить текстуру</button>}</div>}
        <div className="cosmetic-3d-tools-head"><b>Положение и размер</b><small>Изменения сразу видны в окне</small></div>
        <div className="cosmetic-3d-sliders">
          <label>Смещение X <input type="range" min="-1" max="1" step="0.01" value={props.positionX} onChange={event => props.onChange({ positionX: Number(event.target.value) })}/><output>{props.positionX.toFixed(2)}</output></label>
          <label>Смещение Y <input type="range" min="-1" max="1" step="0.01" value={props.positionY} onChange={event => props.onChange({ positionY: Number(event.target.value) })}/><output>{props.positionY.toFixed(2)}</output></label>
          <label>Смещение Z <input type="range" min="-1" max="1" step="0.01" value={props.positionZ} onChange={event => props.onChange({ positionZ: Number(event.target.value) })}/><output>{props.positionZ.toFixed(2)}</output></label>
          <label>Масштаб <input type="range" min="0.1" max="2.5" step="0.05" value={props.scale} onChange={event => props.onChange({ scale: Number(event.target.value) })}/><output>{props.scale.toFixed(2)}×</output></label>
          <label>Поворот Y <input type="range" min="-180" max="180" step="1" value={props.rotationY} onChange={event => props.onChange({ rotationY: Number(event.target.value) })}/><output>{Math.round(props.rotationY)}°</output></label>
        </div>
        <label className="cosmetic-3d-animation">Анимация<select value={props.animation} onChange={event => props.onChange({ animation: event.target.value })}><option value="none">Без анимации</option><option value="bob">Плавное покачивание</option><option value="spin">Вращение</option><option value="pulse">Пульсация</option></select></label>
      </div>
    </div>
  );
}

function applyTexture(dataUrl: string, root: THREE.Object3D) {
  new THREE.TextureLoader().load(dataUrl, texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => {
        if ("map" in material) {
          material.map = texture;
          material.needsUpdate = true;
        }
      });
    });
  });
}

