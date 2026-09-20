import * as THREE from 'three'

function tagTemplateGroup(group: THREE.Group): THREE.Group {
  group.traverse((c) => {
    c.userData['isTemplate'] = true
  })
  return group
}

let _streetLampTemplate: THREE.Group | null = null
export function getStreetLampTemplate(): THREE.Group {
  if (_streetLampTemplate) return _streetLampTemplate
  const group = new THREE.Group()
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x1c2420, roughness: 0.52, metalness: 0.55 })
  const baseGeo = new THREE.CylinderGeometry(0.24, 0.32, 0.7, 8)
  baseGeo.translate(0, 0.35, 0)
  group.add(new THREE.Mesh(baseGeo, lampMat))

  const shaftGeo = new THREE.CylinderGeometry(0.09, 0.14, 3.2, 8)
  shaftGeo.translate(0, 2.3, 0)
  group.add(new THREE.Mesh(shaftGeo, lampMat))

  const armGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.2, 6)
  armGeo.rotateZ(-0.45)
  armGeo.translate(0, 3.8, 0.35)
  group.add(new THREE.Mesh(armGeo, lampMat))

  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff0c8,
    emissive: 0xffe299,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  })
  const lanternGeo = new THREE.CylinderGeometry(0.14, 0.20, 0.32, 6)
  lanternGeo.translate(0, 4.2, 0.6)
  group.add(new THREE.Mesh(lanternGeo, headMat))

  _streetLampTemplate = tagTemplateGroup(group)
  return _streetLampTemplate
}

let _trafficLightTemplate: THREE.Group | null = null
export function getTrafficLightTemplate(): THREE.Group {
  if (_trafficLightTemplate) return _trafficLightTemplate
  const group = new THREE.Group()

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.6, metalness: 0.4 })
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.10, 4.2, 8)
  poleGeo.translate(0, 2.1, 0)
  group.add(new THREE.Mesh(poleGeo, poleMat))

  const armGeo = new THREE.BoxGeometry(0.07, 0.07, 1.8)
  armGeo.translate(0, 4.1, 0.9)
  group.add(new THREE.Mesh(armGeo, poleMat))

  const boxMat = new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.75 })
  const boxGeo = new THREE.BoxGeometry(0.22, 0.65, 0.18)
  boxGeo.translate(0, 3.2, 0.15)
  group.add(new THREE.Mesh(boxGeo, boxMat))

  const redMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff1100, emissiveIntensity: 2.0 })
  const redLight = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), redMat)
  redLight.position.set(0, 3.42, 0.24)
  group.add(redLight)

  const amberMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.3 })
  const amberLight = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), amberMat)
  amberLight.position.set(0, 3.20, 0.24)
  group.add(amberLight)

  const greenMat = new THREE.MeshStandardMaterial({ color: 0x00cc44, emissive: 0x00bb33, emissiveIntensity: 1.2 })
  const greenLight = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), greenMat)
  greenLight.position.set(0, 2.98, 0.24)
  group.add(greenLight)

  _trafficLightTemplate = tagTemplateGroup(group)
  return _trafficLightTemplate
}