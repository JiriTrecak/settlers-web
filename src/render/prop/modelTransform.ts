import {Group,type Object3D} from 'three';
import type {ModelTransform} from '../../shared/authoring/modelCatalogue';

/** Pivot is a point in unscaled, unrotated source coordinates. Keep the source
 * root intact so animation tracks cannot overwrite authoring/placement transforms. */
export function transformedModel(source:Object3D,transform:ModelTransform,groundOffset=0):Group{
 const placement=new Group(),orientation=new Group(),pivot=new Group();
 orientation.name='Authored orientation';pivot.name='Authored pivot';
 orientation.scale.setScalar(transform.scale);
 orientation.rotation.y=transform.forward==='-Z'?Math.PI:0;
 pivot.position.fromArray(transform.pivot).negate();
 pivot.position.y+=groundOffset;
 pivot.add(source);orientation.add(pivot);placement.add(orientation);
 return placement;
}
