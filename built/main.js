import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { BoardState, BoardObject } from "./ui/ui.js";
const focusBoard = document.getElementById("board");
if (!focusBoard)
    throw new Error("Element #board not found");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1, 3);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const canvas = renderer.domElement;
renderer.setSize(window.innerWidth, window.innerHeight);
focusBoard.innerHTML = "";
focusBoard.appendChild(renderer.domElement);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const intersectedOutlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
const selectedOutlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
const targetOutlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
intersectedOutlinePass.edgeStrength = 4;
intersectedOutlinePass.edgeGlow = 0;
intersectedOutlinePass.edgeThickness = 1.5;
intersectedOutlinePass.visibleEdgeColor.set(0xffffff);
selectedOutlinePass.edgeStrength = 4;
selectedOutlinePass.edgeGlow = 1.0;
selectedOutlinePass.edgeThickness = 2.5;
selectedOutlinePass.visibleEdgeColor.set(0xffff00);
targetOutlinePass.edgeStrength = 4;
targetOutlinePass.edgeGlow = 0;
targetOutlinePass.edgeThickness = 1.5;
targetOutlinePass.visibleEdgeColor.set(0x00ff00);
composer.addPass(intersectedOutlinePass);
composer.addPass(selectedOutlinePass);
composer.addPass(targetOutlinePass);
composer.addPass(new OutputPass());
resizeRendererToContainer();
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 7.5;
controls.maxDistance = 8.5;
const light = new THREE.DirectionalLight(0xffffff, 1.2);
light.position.set(2, 4, 2);
scene.add(light);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const board = new BoardState();
const boardObject = new BoardObject(board, scene, selectedOutlinePass, intersectedOutlinePass, targetOutlinePass);
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    composer.render();
}
animate();
window.addEventListener("resize", () => {
    resizeRendererToContainer();
});
function updateMouseFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const inside = event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
    if (!inside)
        return false;
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return true;
}
canvas.addEventListener("mousemove", (event) => {
    if (!updateMouseFromEvent(event)) {
        boardObject.unintersectStack();
        return;
    }
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
        boardObject.intersectStack(intersects[0].object);
    }
    else {
        boardObject.unintersectStack();
    }
});
canvas.addEventListener("mouseleave", () => {
    boardObject.unintersectStack();
});
canvas.addEventListener("click", (event) => {
    if (!updateMouseFromEvent(event))
        return;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
        boardObject.selectStack(intersects[0].object);
    }
    else {
        boardObject.unselectStack();
    }
});
function resizeRendererToContainer() {
    const rect = focusBoard?.getBoundingClientRect();
    const side = Math.max(1, Math.floor(Math.min(rect?.width || 0, rect?.height || 0)));
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    renderer.setSize(side, side, false);
    composer.setSize(side, side);
    intersectedOutlinePass.setSize(side, side);
    selectedOutlinePass.setSize(side, side);
    targetOutlinePass.setSize(side, side);
}
//# sourceMappingURL=main.js.map