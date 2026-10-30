import test from 'node:test';import assert from 'node:assert/strict';import {hashPassword,verifyPassword,hasPermission} from '../src/security.js';
test('password hash verifies correct password only',async()=>{const h=await hashPassword('CorrectHorseBattery!');assert.notEqual(h,'CorrectHorseBattery!');assert.equal(await verifyPassword('CorrectHorseBattery!',h),true);assert.equal(await verifyPassword('wrong',h),false)});
test('platform admin has platform permissions',()=>assert.equal(hasPermission({role:'platform_admin'},'tenants.create'),true));
test('institution owner cannot create platform tenants',()=>{assert.equal(hasPermission({role:'institution_owner',tenantId:'a'},'tenants.create'),false);assert.equal(hasPermission({role:'institution_owner'},'institution.settings.update'),true)});
test('unknown role has no permissions',()=>assert.equal(hasPermission({role:'unknown'},'tenants.view'),false));
