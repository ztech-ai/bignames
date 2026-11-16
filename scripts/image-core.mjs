import assert from 'node:assert/strict';
import { safeUrl } from './utils.mjs';

export const hasPortrait = image => image.kind !== 'placeholder';

export function validateImageMetadata(image, id) {
  if(image?.kind==='placeholder') {
    assert.equal(image.status,'awaiting-permission',`${id}: invalid portrait placeholder status`);
    assert.equal(image.approvedBy,'user',`${id}: portrait placeholder requires an explicit editorial exception`);
    assert(typeof image.reason==='string'&&image.reason.trim(),`${id}: missing portrait exception reason`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(image.verifiedAt??''),`${id}: missing portrait review date`);
    for(const field of ['src','credit','creditUrl','license','licenseUrl','sourceUrl','licenseText','permissionNotice','zoom'])assert(!Object.hasOwn(image,field),`${id}: a name placeholder must not claim an image or license`);
    return;
  }
  assert(['photo','painting','engraving'].includes(image?.kind),`${id}: invalid portrait kind`);
  assert.match(image.src,/^assets\/portraits\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/);
  assert(image.credit&&image.alt&&image.license&&safeUrl(image.sourceUrl)&&safeUrl(image.licenseUrl),`${id}: incomplete image provenance`);
  if(Object.hasOwn(image,'creditUrl'))assert(typeof image.creditUrl==='string'&&safeUrl(image.creditUrl),`${id}: invalid image credit URL`);
  if(image.licenseText)assert.match(image.licenseText,/^assets\/licenses\/[a-zA-Z0-9.-]+\.txt$/,`${id}: unsafe bundled license path`);
  if(Object.hasOwn(image,'permissionNotice'))assert(typeof image.permissionNotice==='string'&&image.permissionNotice.trim(),`${id}: invalid image permission notice`);
  if(Object.hasOwn(image,'zoom')) {
    assert(typeof image.zoom==='number'&&Number.isFinite(image.zoom)&&image.zoom>=1&&image.zoom<=6,`${id}: image zoom must be a number from 1 to 6`);
    const anchor=typeof image.position==='string'?image.position.match(/^(\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%$/):null;
    assert(anchor&&anchor.slice(1).every(value=>Number(value)<=100),`${id}: zoom requires a percentage image position within 0–100`);
  }
}
