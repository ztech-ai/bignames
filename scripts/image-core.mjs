import assert from 'node:assert/strict';
import { safeUrl } from './utils.mjs';

export const hasPortrait = image => image.kind !== 'placeholder';

export function validateImageMetadata(image, id) {
  if(image?.kind==='placeholder') {
    assert.equal(image.status,'awaiting-permission',`${id}: invalid portrait placeholder status`);
    assert.equal(image.approvedBy,'user',`${id}: portrait placeholder requires an explicit editorial exception`);
    assert(typeof image.reason==='string'&&image.reason.trim(),`${id}: missing portrait exception reason`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(image.verifiedAt??''),`${id}: missing portrait review date`);
    for(const field of ['src','credit','license','licenseUrl','sourceUrl','licenseText','permissionNotice'])assert(!Object.hasOwn(image,field),`${id}: a name placeholder must not claim an image or license`);
    return;
  }
  assert(['photo','painting','engraving'].includes(image?.kind),`${id}: invalid portrait kind`);
  assert.match(image.src,/^assets\/portraits\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/);
  assert(image.credit&&image.alt&&image.license&&safeUrl(image.sourceUrl)&&safeUrl(image.licenseUrl),`${id}: incomplete image provenance`);
  if(image.licenseText)assert.match(image.licenseText,/^assets\/licenses\/[a-zA-Z0-9.-]+\.txt$/,`${id}: unsafe bundled license path`);
  if(Object.hasOwn(image,'permissionNotice'))assert(typeof image.permissionNotice==='string'&&image.permissionNotice.trim(),`${id}: invalid image permission notice`);
}
