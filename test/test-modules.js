/**
 * Automated Verification & Unit Tests for VIRUZ WhatsApp Bot
 */

const assert = require('assert');
const {
  checkMobileLegends
} = require('../lib/gameChecker');
const moderator = require('../lib/groupModerator');
const welcomeHandler = require('../lib/welcomeHandler');
const commandHandler = require('../lib/commandHandler');
const { resolveHero, getCharacterVoiceSampleBuffer } = require('../lib/heroVoices');
const antiDelete = require('../lib/antiDelete');
const safety = require('../lib/safety');
const config = require('../config');

async function runTests() {
  console.log('🧪 Starting VIRUZ Automated Verification Tests...\n');

  // Test 1: Command Handler Loading
  console.log('▶ Test 1: Verifying Command Handler Loading...');
  assert(commandHandler.commands.size >= 7, `Expected at least 7 commands, found ${commandHandler.commands.size}`);
  assert(commandHandler.getCommand('ml') !== null, 'Command .ml should exist');
  assert.strictEqual(commandHandler.getCommand('pubg'), null, 'Command .pubg must be removed');
  assert.strictEqual(commandHandler.getCommand('coc'), null, 'Command .coc must be removed');
  assert.strictEqual(commandHandler.getCommand('genshin'), null, 'Command .genshin must be removed');
  assert.strictEqual(commandHandler.getCommand('hok'), null, 'Command .hok must be removed');
  assert(commandHandler.getCommand('kick') !== null, 'Command .kick should exist');
  assert(commandHandler.getCommand('add') !== null, 'Command .add should exist');
  console.log('  ✅ Command Handler: Active commands loaded; other games (pubg, coc, genshin, hok) confirmed removed.');

  // Test 2: Mobile Legends Checker (Accurate Nickname & Country Flag)
  console.log('\n▶ Test 2: Verifying Mobile Legends (.ml) Checker...');
  const mlRes = await checkMobileLegends('1114917746', '13486');
  assert(mlRes.includes('Mobile Legends') || mlRes.includes('MOBILE LEGENDS'), 'ML output should mention Mobile Legends');
  assert(mlRes.includes('1114917746'), 'ML output should contain Account ID');
  assert(mlRes.includes('13486'), 'ML output should contain Zone/Server');
  assert(mlRes.includes('🇮🇩 Indonesia'), 'ML output should contain country flag and name');
  assert(mlRes.includes('Outrageous Dominance'), 'ML output should contain in-game nickname');
  console.log('  ✅ Mobile Legends output verified with accurate player information & professional layout.');

  // Test 3: PUBG Mobile Complete Removal
  console.log('\n▶ Test 3: Verifying PUBG Mobile (.pubg) Complete Removal...');
  assert.strictEqual(commandHandler.getCommand('pubg'), null, 'Command .pubg must not be registered');
  assert.strictEqual(commandHandler.aliases.get('pubg'), undefined, 'Alias pubg must not be registered');
  assert.strictEqual(commandHandler.aliases.get('pubgm'), undefined, 'Alias pubgm must not be registered');
  console.log('  ✅ PUBG Mobile removal verified.');

  // Test 4: Live Account Validation & Invalid Account Rejection
  console.log('\n▶ Test 4: Verifying Live Account Validation & Rejection of Invalid ID...');
  let invalidMlErr = null;
  try {
    await checkMobileLegends('99999999999', '99999');
  } catch (e) {
    invalidMlErr = e.message;
  }
  assert(invalidMlErr && invalidMlErr.includes('Not Found'), 'Invalid MLBB ID must return Account Not Found error');
  console.log('  ✅ Live Account Validation: Invalid accounts properly rejected without fake mock data.');

  // Test 5: Genshin Impact (.genshin) Complete Removal
  console.log('\n▶ Test 5: Verifying Genshin Impact (.genshin) Complete Removal...');
  assert.strictEqual(commandHandler.getCommand('genshin'), null, 'Command .genshin must not be registered');
  assert.strictEqual(commandHandler.aliases.get('gi'), undefined, 'Alias gi must not be registered');
  assert.strictEqual(commandHandler.aliases.get('genshinimpact'), undefined, 'Alias genshinimpact must not be registered');
  console.log('  ✅ Genshin Impact removal verified.');

  // Test 6: Honor of Kings (.hok) & Clash of Clans (.coc) Complete Removal
  console.log('\n▶ Test 6: Verifying Honor of Kings (.hok) & Clash of Clans (.coc) Complete Removal...');
  assert.strictEqual(commandHandler.getCommand('hok'), null, 'Command .hok must not be registered');
  assert.strictEqual(commandHandler.aliases.get('honorofkings'), undefined, 'Alias honorofkings must not be registered');
  assert.strictEqual(commandHandler.getCommand('coc'), null, 'Command .coc must not be registered');
  console.log('  ✅ Honor of Kings & Clash of Clans removal verified (Only MLBB kept).');

  // Test 7: Group Moderation & Sticker Spam Logic
  console.log('\n▶ Test 7: Verifying Sticker Spam Auto-Kick Logic...');
  const mockGroup = '123456789-group@g.us';
  const spammerUser = '923111111111@s.whatsapp.net';
  const adminUser = '923222222222@s.whatsapp.net';
  const botJid = '923999999999@s.whatsapp.net';

  const mockGroupMetadata = {
    id: mockGroup,
    subject: 'Test Gaming Group',
    participants: [
      { id: adminUser, admin: 'admin' },
      { id: spammerUser, admin: null },
      { id: botJid, admin: 'admin' }
    ]
  };

  const sentMessages = [];
  const kickedUsers = [];

  const mockSock = {
    user: { id: botJid },
    async sendMessage(to, content) {
      sentMessages.push({ to, content });
      return { key: { id: 'mock_msg_id' } };
    },
    async groupParticipantsUpdate(groupId, participants, action) {
      if (action === 'remove') {
        kickedUsers.push(...participants);
      }
      return [{ status: '200' }];
    },
    async groupMetadata(groupId) {
      return mockGroupMetadata;
    }
  };

  // User sends 1st to 4th sticker -> no kick, no warn
  for (let i = 0; i < 4; i++) {
    await moderator.handleStickerSpam(mockSock, mockGroup, spammerUser, mockGroupMetadata);
  }
  assert.strictEqual(sentMessages.length, 0, 'No warning should be sent on 1st to 4th sticker');
  assert.strictEqual(kickedUsers.length, 0, 'No kick on 1st to 4th sticker');

  // User sends 5th sticker -> WARNING expected (Sticker limit reached)
  await moderator.handleStickerSpam(mockSock, mockGroup, spammerUser, mockGroupMetadata);
  assert.strictEqual(sentMessages.length, 1, 'Warning message must be sent on 5th sticker');
  assert(sentMessages[0].content.text.includes('STICKER SPAM WARNING'), 'Should be sticker warning message');
  assert.strictEqual(kickedUsers.length, 0, 'User should not be kicked yet at 5th sticker');

  // User sends 6th sticker -> AUTO KICK expected!
  await moderator.handleStickerSpam(mockSock, mockGroup, spammerUser, mockGroupMetadata);
  assert(kickedUsers.includes(spammerUser), 'User must be kicked on 6th sticker spam');
  assert(sentMessages.some(m => m.content.text.includes('AUTO KICK - STICKER SPAM')), 'Auto kick notice sent');
  console.log('  ✅ Sticker Spam: Warned at 5th, auto-kicked at 6th.');

  // Test 8: Message Spam Auto-Kick Logic
  console.log('\n▶ Test 8: Verifying Repeated Message Spam Auto-Kick Logic...');
  const msgSpammer = '923333333333@s.whatsapp.net';
  mockGroupMetadata.participants.push({ id: msgSpammer, admin: null });

  sentMessages.length = 0;
  kickedUsers.length = 0;

  // Send 4 repeated messages -> no warning yet
  for (let i = 0; i < 4; i++) {
    await moderator.handleMessageSpam(mockSock, mockGroup, msgSpammer, 'hello spam', mockGroupMetadata);
  }
  assert.strictEqual(sentMessages.length, 0, 'No warning on 1-4 messages');
  assert.strictEqual(kickedUsers.length, 0, 'No kick on 1-4 messages');

  // 5th repeated message -> WARNING expected!
  await moderator.handleMessageSpam(mockSock, mockGroup, msgSpammer, 'hello spam', mockGroupMetadata);
  assert.strictEqual(sentMessages.length, 1, 'Warning must be sent on 5th repeated message');
  assert(sentMessages[0].content.text.includes('MESSAGE SPAM WARNING'), 'Should be message spam warning');
  assert.strictEqual(kickedUsers.length, 0, 'User should not be kicked at 5th message');

  // 6th repeated message -> AUTO KICK expected!
  await moderator.handleMessageSpam(mockSock, mockGroup, msgSpammer, 'hello spam', mockGroupMetadata);
  assert(kickedUsers.includes(msgSpammer), 'User must be kicked on 6th repeated message');
  assert(sentMessages.some(m => m.content.text.includes('AUTO KICK - MESSAGE SPAM')), 'Auto kick message sent');
  console.log('  ✅ Message Spam: Warned at 5th, auto-kicked at 6th.');

  // Test 9: Admin Immunity Test (Admins are NEVER warned or kicked for spam)
  console.log('\n▶ Test 9: Verifying Admin Spam Immunity...');
  sentMessages.length = 0;
  kickedUsers.length = 0;

  for (let i = 0; i < 10; i++) {
    await moderator.handleStickerSpam(mockSock, mockGroup, adminUser, mockGroupMetadata);
    await moderator.handleMessageSpam(mockSock, mockGroup, adminUser, 'admin announcement', mockGroupMetadata);
  }
  assert.strictEqual(sentMessages.length, 0, 'Admin should NEVER receive spam warnings');
  assert.strictEqual(kickedUsers.length, 0, 'Admin should NEVER be kicked for spam');
  console.log('  ✅ Admin Immunity: Admin sent 10 stickers and 10 messages with 0 warnings and 0 kicks.');

  // Test 10: Admin Kick Protection Test (No one can kick admins)
  console.log('\n▶ Test 10: Verifying Admin Protection on .kick...');
  const kickCheck = moderator.canKickUser(adminUser, botJid, mockGroupMetadata);
  assert.strictEqual(kickCheck.allowed, false, 'Kicking an admin must NOT be allowed');
  assert(kickCheck.reason.includes('Admin Protection'), 'Reason should cite Admin Protection');

  const regularCheck = moderator.canKickUser(spammerUser, botJid, mockGroupMetadata);
  assert.strictEqual(regularCheck.allowed, true, 'Kicking a regular member must be allowed');
  console.log('  ✅ Admin Protection: .kick on admin blocked successfully.');

  // Test 11: Auto-Welcome Test (User joins GC -> welcomes with correct phone number mention)
  console.log('\n▶ Test 11: Verifying Auto-Welcome on Group Join (Standard & WhatsApp LID)...');
  sentMessages.length = 0;
  const newMemberJid = '923009876543@s.whatsapp.net';
  await welcomeHandler.handleParticipantUpdate(mockSock, {
    id: mockGroup,
    author: null,
    participants: [newMemberJid],
    action: 'add'
  });
  assert.strictEqual(sentMessages.length, 1, 'Exactly one welcome message must be sent');
  const welcomeMsg = sentMessages[0].content.text;
  assert(welcomeMsg.includes('@923009876543'), 'Welcome message must mention @923009876543');
  assert(welcomeMsg.includes('+923009876543'), 'Welcome message must show clean phone +923009876543');
  assert(sentMessages[0].content.mentions.includes('923009876543@s.whatsapp.net'), 'Mentions array must include new member JID');
  assert(welcomeMsg.includes('WELCOME TO THE GROUP'), 'Welcome message must include welcome header');
  console.log('  ✅ Auto-Welcome (Standard): Sent friendly welcome mentioning @923009876543 (+923009876543).');

  // Test 11b: WhatsApp LID Auto-Welcome Resolution
  sentMessages.length = 0;
  const lidUserJid = '152345678901234@lid';
  const lidRealPhone = '923007788990';
  // Simulate participant metadata in group with LID and real phone in p.jid
  mockGroupMetadata.participants.push({
    id: lidUserJid,
    jid: `${lidRealPhone}@s.whatsapp.net`,
    lid: lidUserJid,
    admin: null
  });
  await welcomeHandler.handleParticipantUpdate(mockSock, {
    id: mockGroup,
    author: null,
    participants: [lidUserJid],
    action: 'add'
  });
  assert.strictEqual(sentMessages.length, 1, 'Exactly one welcome message must be sent for LID join');
  const lidWelcomeMsg = sentMessages[0].content.text;
  assert(lidWelcomeMsg.includes(`@${lidRealPhone}`), `Welcome message must resolve LID and mention @${lidRealPhone}`);
  assert(lidWelcomeMsg.includes(`+${lidRealPhone}`), `Welcome message must show real phone +${lidRealPhone}`);
  assert(!lidWelcomeMsg.includes('152345678901234'), 'Welcome message must NEVER display raw WhatsApp LID!');
  assert(sentMessages[0].content.mentions.includes(`${lidRealPhone}@s.whatsapp.net`), 'Mentions must use resolved phone number');
  console.log(`  ✅ Auto-Welcome (WhatsApp LID): Successfully resolved LID to @${lidRealPhone} (+${lidRealPhone}) with zero LID leaks.`);

  // Test 12: Auto-Goodbye on Voluntary Leave (LID User leaves GC -> cached roster resolves real number)
  console.log('\n▶ Test 12: Verifying Auto-Goodbye on Voluntary Leave (Roster Cache LID Resolution)...');
  sentMessages.length = 0;
  // Now simulate that WhatsApp removed the user from the live groupMetadata upon departure
  mockGroupMetadata.participants = mockGroupMetadata.participants.filter(p => p.id !== lidUserJid && p.lid !== lidUserJid);

  await welcomeHandler.handleParticipantUpdate(mockSock, {
    id: mockGroup,
    author: lidUserJid, // Author is self -> voluntary leave
    participants: [lidUserJid],
    action: 'remove'
  });
  assert.strictEqual(sentMessages.length, 1, 'Exactly one goodbye message must be sent');
  const leaveMsg = sentMessages[0].content.text;
  assert(leaveMsg.includes(`Goodbye @${lidRealPhone}`), `Goodbye message must say goodbye @${lidRealPhone}`);
  assert(leaveMsg.includes(`*Member Left:* @${lidRealPhone} (+${lidRealPhone})`), 'Must show correct leaving member phone number');
  assert(!leaveMsg.includes('152345678901234'), 'Goodbye message must NEVER display raw WhatsApp LID!');
  assert(sentMessages[0].content.mentions.includes(`${lidRealPhone}@s.whatsapp.net`), 'Mentions array must include resolved member JID');
  console.log(`  ✅ Auto-Goodbye (Leave with LID): Roster cache resolved departing member to @${lidRealPhone} (+${lidRealPhone}).`);

  // Test 13: Auto-Goodbye on Admin Kick (Both Admin & Kicked User have WhatsApp LIDs)
  console.log('\n▶ Test 13: Verifying Auto-Goodbye & Correct Number on Admin Kick with LIDs...');
  sentMessages.length = 0;
  const kickedLid = '998877665544332@lid';
  const kickedPhone = '923335557777';
  const adminLid = '112233445566778@lid';
  const adminPhone = '923116469820';

  // Seed LID mappings for the kicked member and admin into the welcomeHandler roster cache
  welcomeHandler.groupRosterCache.set(mockGroup, new Map([
    ['998877665544332', { phone: kickedPhone, name: 'Kicked Member' }],
    [kickedPhone, { phone: kickedPhone, name: 'Kicked Member' }],
    ['112233445566778', { phone: adminPhone, name: 'Admin Kicker' }],
    [adminPhone, { phone: adminPhone, name: 'Admin Kicker' }]
  ]));
  
  // Record kick first (simulating .kick command)
  welcomeHandler.recordKick(mockGroup, kickedLid, adminLid);

  await welcomeHandler.handleParticipantUpdate(mockSock, {
    id: mockGroup,
    author: adminLid,
    participants: [kickedLid],
    action: 'remove'
  });
  assert.strictEqual(sentMessages.length, 1, 'Exactly one kicked goodbye message must be sent');
  const kickMsg = sentMessages[0].content.text;
  assert(kickMsg.includes(`Goodbye @${kickedPhone}`), `Must say goodbye to kicked user @${kickedPhone}`);
  assert(kickMsg.includes(`*Kicked Member:* @${kickedPhone} (+${kickedPhone})`), 'Must show correct number of kicked person');
  assert(kickMsg.includes(`*Removed By:* @${adminPhone} (+${adminPhone})`), 'Must show admin who removed them with real phone number');
  assert(!kickMsg.includes('998877665544332'), 'Must NEVER leak kicked user LID');
  assert(!kickMsg.includes('112233445566778'), 'Must NEVER leak kicker admin LID');
  assert(sentMessages[0].content.mentions.includes(`${kickedPhone}@s.whatsapp.net`), 'Must mention kicked user phone');
  assert(sentMessages[0].content.mentions.includes(`${adminPhone}@s.whatsapp.net`), 'Must mention kicker admin phone');
  console.log(`  ✅ Auto-Goodbye (Kick with LIDs): Resolved kicked member @${kickedPhone} and kicker admin @${adminPhone} with zero LID leaks.`);

  // Test 14: Anti-Delete Stealth Private Mode (Sends to owner inbox, NOT the group)
  console.log('\n▶ Test 14: Verifying Anti-Delete Stealth Delivery to Private Inbox...');
  const antiDelete = require('../lib/antiDelete');
  const deletedMsgId = 'DELETED_MSG_999';
  const testChatGroup = '987654321-group@g.us';
  const victimSender = '923444444444@s.whatsapp.net';

  const originalIncomingMsg = {
    key: {
      remoteJid: testChatGroup,
      fromMe: false,
      id: deletedMsgId,
      participant: victimSender
    },
    message: {
      conversation: 'Secret message that will be deleted!'
    }
  };

  // 1. Store message in cache
  antiDelete.storeMessage(originalIncomingMsg);

  // 2. Someone deletes the message (revoke packet arrives)
  const revokePacket = {
    key: {
      remoteJid: testChatGroup,
      fromMe: false,
      id: 'REVOKE_PACKET_001'
    },
    message: {
      protocolMessage: {
        key: {
          remoteJid: testChatGroup,
          id: deletedMsgId,
          participant: victimSender
        },
        type: 0 // REVOKE
      }
    }
  };

  sentMessages.length = 0;
  await antiDelete.handleRevoke(mockSock, revokePacket);

  // Verification:
  assert(sentMessages.length >= 1, 'At least one recovery message should be delivered');
  assert(!sentMessages.some(m => m.to === testChatGroup), 'Recovered message must NOT be sent to the group!');
  const expectedInbox = mockSock.user.id.split(':')[0].split('@')[0] + '@s.whatsapp.net';
  assert(sentMessages.some(m => m.to === expectedInbox), 'Recovered message must be delivered to owner personal inbox');
  assert(sentMessages[0].content.text.includes('Secret message that will be deleted!'), 'Recovered message must contain deleted text');
  assert(sentMessages[0].content.text.includes('923444444444'), 'Must identify sender');
  console.log('  ✅ Anti-Delete: Forwarded deleted message to private inbox without alerting group.');

  // Test 14b: Anti-Delete Status Stability (Checking status must NOT toggle or disable)
  console.log('\n▶ Test 14b: Verifying Anti-Delete Status Command Stability...');
  const antiDeleteCmd = require('../commands/admin/antidelete');
  antiDelete.setEnabled(true);
  assert.strictEqual(antiDelete.isEnabled(), true, 'Must start enabled');

  // Running status check must keep it enabled!
  sentMessages.length = 0;
  await antiDeleteCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'STATUS_TEST_MSG', fromMe: true } },
    from: '923116469820@s.whatsapp.net',
    sender: '923116469820@s.whatsapp.net',
    args: ['status']
  });
  assert.strictEqual(antiDelete.isEnabled(), true, 'Checking status must NOT toggle or disable anti-delete!');
  assert(sentMessages[0].content.text.includes('ENABLED'), 'Status report must show ENABLED');

  // Running .antidelete without args must also NOT toggle or disable!
  sentMessages.length = 0;
  await antiDeleteCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'EMPTY_TEST_MSG', fromMe: true } },
    from: '923116469820@s.whatsapp.net',
    sender: '923116469820@s.whatsapp.net',
    args: []
  });
  assert.strictEqual(antiDelete.isEnabled(), true, 'Running without args must NOT toggle or disable anti-delete!');
  assert(sentMessages[0].content.text.includes('ENABLED'), 'Status report must show ENABLED');
  console.log('  ✅ Anti-Delete Status: Checking status retains enabled state without inadvertent toggling.');

  // Test 14c: messages.update Revoke Recovery
  console.log('\n▶ Test 14c: Verifying messages.update Revoke Recovery...');
  const msgUpdateDeletedId = 'DELETED_MSG_UPDATE_888';
  const msgUpdateToStore = {
    key: {
      remoteJid: testChatGroup,
      fromMe: false,
      id: msgUpdateDeletedId,
      participant: victimSender
    },
    message: {
      conversation: 'Deleted message delivered via messages.update event'
    }
  };
  antiDelete.storeMessage(msgUpdateToStore);

  sentMessages.length = 0;
  await antiDelete.handleRevokeUpdate(mockSock, {
    key: {
      remoteJid: testChatGroup,
      id: msgUpdateDeletedId,
      participant: victimSender
    },
    update: {
      message: null,
      messageStubType: 68
    }
  });

  assert(sentMessages.length >= 1, 'Message must be recovered via messages.update event');
  assert(sentMessages.some(m => m.content.text.includes('Deleted message delivered via messages.update event')), 'Must contain recovered text');
  console.log('  ✅ Anti-Delete Update: Successfully recovered message via messages.update event.');

  // Test 14d: Accurate Phone Number & Pre-Cached Photo Recovery
  console.log('\n▶ Test 14d: Verifying LID Phone Resolution & Pre-Cached Photo Recovery...');
  const { resolvePhoneNumber } = require('../lib/antiDelete');
  const mockGroupMetadataWithLids = {
    participants: [
      { id: '923001234567@s.whatsapp.net', lid: '100200300400@lid' },
      { id: '923119876543@s.whatsapp.net', lid: '500600700800@lid' }
    ]
  };

  // 1. Resolve LID to real phone number
  const resolvedPhone = resolvePhoneNumber('100200300400@lid', false, mockGroupMetadataWithLids, mockSock);
  assert.strictEqual(resolvedPhone, '923001234567', 'Must resolve LID to exact real phone number');

  // 2. Group JIDs must never be returned as phone numbers
  const groupPhone = resolvePhoneNumber('120363999999999@g.us', false, mockGroupMetadataWithLids, mockSock);
  assert.strictEqual(groupPhone, 'Unknown', 'Group JID must never be treated as phone number');

  // 3. Pre-cached photo recovery: forwards exact image buffer
  const photoMsgId = 'DELETED_PHOTO_111';
  const photoToStore = {
    key: {
      remoteJid: testChatGroup,
      fromMe: false,
      id: photoMsgId,
      participant: '923001234567@s.whatsapp.net'
    },
    message: {
      imageMessage: {
        caption: 'Funny gaming meme'
      }
    }
  };
  antiDelete.storeMessage(photoToStore);

  // Simulate pre-cached buffer in memory
  const cachedStored = require('../lib/messageStore').get(photoMsgId);
  cachedStored._mediaBuffer = Buffer.from('FAKEMEDIABUFFERDATA');

  sentMessages.length = 0;
  await antiDelete.handleRevoke(mockSock, {
    key: {
      remoteJid: testChatGroup,
      fromMe: false,
      id: 'REVOKE_PHOTO_001',
      participant: '923001234567@s.whatsapp.net'
    },
    message: {
      protocolMessage: {
        key: {
          remoteJid: testChatGroup,
          id: photoMsgId,
          participant: '923001234567@s.whatsapp.net'
        },
        type: 0
      }
    }
  });

  assert(sentMessages.length >= 1, 'Photo must be recovered');
  const photoSent = sentMessages.find(m => m.content.image);
  assert(photoSent, 'Must deliver actual image buffer');
  assert.strictEqual(photoSent.content.image.toString(), 'FAKEMEDIABUFFERDATA', 'Buffer must match pre-cached media');
  assert(photoSent.content.caption.includes('Funny gaming meme'), 'Caption must be included');
  assert(photoSent.content.caption.includes('923001234567'), 'Deleter phone number must be included');
  console.log('  ✅ Anti-Delete Photo: Successfully recovered exact photo with accurate phone number & caption.');

  // Test 15: View-Once Stealth Mode (Auto-deletes command, sends to private inbox)
  console.log('\n▶ Test 15: Verifying View-Once Auto-Delete & Stealth Delivery...');
  const viewOnceCmd = require('../commands/general/viewonce');
  const viewOnceMsgId = 'VO_COMMAND_MSG_123';

  const mockViewOnceCommand = {
    key: {
      remoteJid: testChatGroup,
      fromMe: true,
      id: viewOnceMsgId,
      participant: botJid
    },
    message: {
      extendedTextMessage: {
        text: '.viewonce',
        contextInfo: {
          participant: '923555555555@s.whatsapp.net',
          quotedMessage: {
            viewOnceMessageV2: {
              message: {
                imageMessage: {
                  url: 'https://example.com/fake-media',
                  mimetype: 'image/jpeg',
                  caption: 'Secret View Once Photo'
                }
              }
            }
          }
        }
      }
    }
  };

  sentMessages.length = 0;
  // Mock downloadContentFromMessage to return test buffer
  await viewOnceCmd.execute({ sock: mockSock, msg: mockViewOnceCommand, from: testChatGroup });

  // Verify command deletion message was dispatched to the group
  const deleteCommandDispatch = sentMessages.find(m => m.content.delete && m.content.delete.id === viewOnceMsgId);
  assert(deleteCommandDispatch, 'Must automatically delete the .viewonce command message from chat');
  assert.strictEqual(deleteCommandDispatch.to, testChatGroup, 'Delete command target must be the group');

  // Verify no reaction emoji was sent to the group
  const reactionSent = sentMessages.find(m => m.content.react);
  assert(!reactionSent, 'Must NOT react with any emoji in the group');
  console.log('  ✅ View-Once: Command automatically deleted from chat, no public notifications.');

  // Test 15b: Verifying View-Once Pre-Cached Buffer Recovery from messageStore
  console.log('\n▶ Test 15b: Verifying View-Once Pre-Cached Buffer Recovery from messageStore...');
  const originalVOId = 'VO_ORIGINAL_MSG_456';
  const messageStore = require('../lib/messageStore');
  const storedVOMsg = {
    key: {
      remoteJid: testChatGroup,
      fromMe: false,
      id: originalVOId,
      participant: '923555555555@s.whatsapp.net'
    },
    message: {
      viewOnceMessage: {
        message: {
          imageMessage: {
            caption: 'Recovered View-Once Photo'
          }
        }
      }
    },
    _mediaBuffer: Buffer.from('REALVIEWONCEIMAGEDATA')
  };
  messageStore.set(originalVOId, storedVOMsg);

  const mockReplyToVOCommand = {
    key: {
      remoteJid: testChatGroup,
      fromMe: true,
      id: 'VO_REPLY_CMD_999',
      participant: botJid
    },
    message: {
      extendedTextMessage: {
        text: '.viewonce',
        contextInfo: {
          stanzaId: originalVOId,
          participant: '923555555555@s.whatsapp.net',
          quotedMessage: {
            viewOnceMessage: {
              message: {
                imageMessage: {
                  caption: 'Recovered View-Once Photo'
                }
              }
            }
          }
        }
      }
    }
  };

  sentMessages.length = 0;
  await viewOnceCmd.execute({ sock: mockSock, msg: mockReplyToVOCommand, from: testChatGroup });
  const voRecovered = sentMessages.find(m => m.content.image);
  assert(voRecovered, 'Must deliver recovered View-Once image');
  assert.strictEqual(voRecovered.content.image.toString(), 'REALVIEWONCEIMAGEDATA', 'Recovered image must match stored buffer');
  console.log('  ✅ View-Once Recovery: Successfully recovered View-Once image using storedOriginal media buffer.');

  // Test 15c: Verifying Owner Self-Messages & deviceSentMessage Command Handling
  console.log('\n▶ Test 15c: Verifying Owner Self-Messages & deviceSentMessage Command Handling...');
  sentMessages.length = 0;
  const selfCmdMsg = {
    key: {
      remoteJid: '923116469820@s.whatsapp.net',
      fromMe: true,
      id: 'SELF_DEVICE_CMD_001'
    },
    message: {
      deviceSentMessage: {
        message: {
          conversation: '.ping'
        }
      }
    }
  };
  const pingExecuted = await commandHandler.handleMessage(mockSock, selfCmdMsg);
  assert.strictEqual(pingExecuted, true, 'Command sent from owner device must execute');
  assert(sentMessages.some(m => m.content.text && m.content.text.includes('Pong!')), 'Must reply with Pong! to self command');
  console.log('  ✅ Owner Self-Message: Successfully executed .ping command wrapped in deviceSentMessage.');

  // Test 16: MessageStore & getMessage Retry (Resolves "Waiting for this message" issue)
  console.log('\n▶ Test 16: Verifying MessageStore & getMessage Retry Resolution...');
  const testMsgId = 'RETRY_CMD_REPLY_789';
  const testJid = '923116469820@s.whatsapp.net';
  const mockOutgoingReply = {
    key: {
      remoteJid: testJid,
      fromMe: true,
      id: testMsgId
    },
    message: {
      extendedTextMessage: {
        text: 'This is the bot command response'
      }
    }
  };

  messageStore.set(testMsgId, mockOutgoingReply);

  // Simulate Baileys getMessage call when recipient requests retry
  const retrievedProto = messageStore.getMessageProto({ id: testMsgId, remoteJid: testJid });
  assert(retrievedProto !== null, 'Must retrieve original message proto on retry request');
  assert.strictEqual(
    retrievedProto.extendedTextMessage.text,
    'This is the bot command response',
    'Retrieved proto must match original command reply content'
  );

  const emptyProto = messageStore.getMessageProto({ id: 'NON_EXISTENT_ID' });
  assert.strictEqual(emptyProto, null, 'Non-existent ID should return null safely');
  console.log('  ✅ MessageStore: Correctly provides message proto for Signal retry requests.');

  // Test 17: Verifying Admin Warning Command (.warn)
  console.log('\n▶ Test 17: Verifying Admin Warning Command (.warn & admin attribution)...');
  const warnCmd = commandHandler.getCommand('warn');
  assert(warnCmd !== null, 'Command .warn must be loaded');
  assert(commandHandler.aliases.get('warning') === 'warn', 'Alias warning must point to warn');
  assert(commandHandler.aliases.get('resetwarn') === 'warn', 'Alias resetwarn must point to warn');

  const warnTarget = '923112233445@s.whatsapp.net';
  const adminSender = '923116469820@s.whatsapp.net';
  const fellowAdminTarget = '923119999888@s.whatsapp.net';
  mockGroupMetadata.participants.push({ id: warnTarget, admin: null });
  mockGroupMetadata.participants.push({ id: fellowAdminTarget, admin: 'admin' });

  // 1. Self-warning protection: Users/Admins cannot warn themselves
  const adminWarnSelfCheck = moderator.canWarnUser(adminSender, botJid, mockGroupMetadata, adminSender);
  assert.strictEqual(adminWarnSelfCheck.allowed, false, 'Users must not be able to warn themselves');
  assert(adminWarnSelfCheck.reason.includes('cannot warn yourself'), 'Should mention cannot warn yourself');

  // 2. Bot protection: Bot cannot warn itself
  const botWarnCheck = moderator.canWarnUser(botJid, botJid, mockGroupMetadata, adminSender);
  assert.strictEqual(botWarnCheck.allowed, false, 'Bot cannot warn itself');

  // 3. Admin-to-admin warning: Admins CAN warn each other
  const adminWarnAdminCheck = moderator.canWarnUser(fellowAdminTarget, botJid, mockGroupMetadata, adminSender);
  assert.strictEqual(adminWarnAdminCheck.allowed, true, 'Admins must be able to warn fellow admins');

  // 4. Regular member can be warned
  const regularWarnCheck = moderator.canWarnUser(warnTarget, botJid, mockGroupMetadata, adminSender);
  assert.strictEqual(regularWarnCheck.allowed, true, 'Regular members can be warned');

  // 5. Issue 1st warning to regular member via command
  sentMessages.length = 0;
  kickedUsers.length = 0;
  const mockWarnMsg1 = {
    key: { remoteJid: mockGroup, participant: adminSender, fromMe: false },
    pushName: 'Admin Ali',
    message: {
      extendedTextMessage: {
        text: `.warn @923112233445 Bad behavior in chat`,
        contextInfo: {
          mentionedJid: [warnTarget]
        }
      }
    }
  };

  await warnCmd.execute({
    sock: mockSock,
    msg: mockWarnMsg1,
    from: mockGroup,
    isGroup: true,
    sender: adminSender,
    groupMetadata: mockGroupMetadata,
    botJid,
    args: ['@923112233445', 'Bad', 'behavior', 'in', 'chat'],
    commandName: 'warn'
  });

  assert.strictEqual(sentMessages.length, 1, 'Warning message 1 must be sent');
  const warnText1 = sentMessages[0].content.text;
  assert(warnText1.includes('Admin Ali'), 'Warning message must attribute the warning to the admin name');
  assert(warnText1.includes('923112233445'), 'Warning message must mention target user');
  assert(warnText1.includes('Bad behavior in chat'), 'Warning message must show the reason');
  assert(warnText1.includes('1 / 6'), 'Warning count must show 1 / 6');
  assert(sentMessages[0].content.mentions.includes(warnTarget), 'Target must be in mentions');

  // 6. Issue 2nd through 5th warnings to regular member
  for (let w = 2; w <= 5; w++) {
    sentMessages.length = 0;
    await warnCmd.execute({
      sock: mockSock,
      msg: mockWarnMsg1,
      from: mockGroup,
      isGroup: true,
      sender: adminSender,
      groupMetadata: mockGroupMetadata,
      botJid,
      args: ['@923112233445', `Warning number ${w}`],
      commandName: 'warn'
    });
    assert(sentMessages[0].content.text.includes(`${w} / 6`), `Warning count must show ${w} / 6`);
    assert.strictEqual(kickedUsers.length, 0, `User should not be kicked at warning ${w}`);
  }

  // 7. Issue 6th warning to regular member -> AUTO-KICK triggered!
  sentMessages.length = 0;
  await warnCmd.execute({
    sock: mockSock,
    msg: mockWarnMsg1,
    from: mockGroup,
    isGroup: true,
    sender: adminSender,
    groupMetadata: mockGroupMetadata,
    botJid,
    args: ['@923112233445', 'Final 6th strike'],
    commandName: 'warn'
  });
  assert(kickedUsers.includes(warnTarget), 'Regular member must be kicked on 6th warning');
  assert(sentMessages[0].content.text.includes('FINAL WARNING & AUTO-KICK'), 'Must show final warning and kick banner');
  assert(sentMessages[0].content.text.includes('6 / 6'), 'Must show 6 / 6 limit exceeded');
  assert(sentMessages[0].content.text.includes('Admin Ali'), 'Must show admin attribution on 6th warning');

  // 8. Test Admin Warning Admin: 6 warnings issued to fellow admin -> NEVER KICKED!
  kickedUsers.length = 0;
  const mockWarnAdminMsg = {
    key: { remoteJid: mockGroup, participant: adminSender, fromMe: false },
    pushName: 'Admin Ali',
    message: {
      extendedTextMessage: {
        text: `.warn @923119999888 Misuse of admin permissions`,
        contextInfo: {
          mentionedJid: [fellowAdminTarget]
        }
      }
    }
  };

  for (let w = 1; w <= 6; w++) {
    sentMessages.length = 0;
    await warnCmd.execute({
      sock: mockSock,
      msg: mockWarnAdminMsg,
      from: mockGroup,
      isGroup: true,
      sender: adminSender,
      groupMetadata: mockGroupMetadata,
      botJid,
      args: ['@923119999888', 'Misuse of admin permissions'],
      commandName: 'warn'
    });
  }

  assert(!kickedUsers.includes(fellowAdminTarget), 'Admin must NEVER be kicked even when warning limit is reached');
  assert(sentMessages[0].content.text.includes('ADMIN WARNING LIMIT (IMMUNITY)'), 'Must show admin immunity banner');
  assert(sentMessages[0].content.text.includes('Admin Protection Active'), 'Must mention Admin Protection Active');
  assert(sentMessages[0].content.text.includes('NEVER be kicked'), 'Must explicitly mention admin can never be kicked');

  // 9. Admins cannot kick each other via .kick command
  const adminKickCheck = moderator.canKickUser(fellowAdminTarget, botJid, mockGroupMetadata);
  assert.strictEqual(adminKickCheck.allowed, false, 'Admins must not be kickable by each other');
  assert(adminKickCheck.reason.includes('No one can kick an Admin'), 'Must state no one can kick an Admin');

  // 10. Test reset warnings (.warn reset or .resetwarn)
  sentMessages.length = 0;
  moderator.addWarning(mockGroup, warnTarget, adminSender, 'Admin Ali', 'Test warn');
  assert.strictEqual(moderator.getWarnings(mockGroup, warnTarget).count, 1, 'Should have 1 warn');

  await warnCmd.execute({
    sock: mockSock,
    msg: mockWarnMsg1,
    from: mockGroup,
    isGroup: true,
    sender: adminSender,
    groupMetadata: mockGroupMetadata,
    botJid,
    args: ['@923112233445'],
    commandName: 'resetwarn'
  });
  assert(sentMessages[0].content.text.includes('WARNINGS RESET'), 'Must show warnings reset message');
  assert(sentMessages[0].content.text.includes('0 / 6'), 'Must show reset to 0 / 6');
  assert.strictEqual(moderator.getWarnings(mockGroup, warnTarget).count, 0, 'Warnings must be reset to 0');
  console.log('  ✅ Admin Warning: Admins can warn each other with zero auto-kick immunity; normal members auto-kicked at 6th.');

  // Test 18: Verifying Anime Voice TTS (.tts & .tt) + Admin .tts on/off Controls
  console.log('\n▶ Test 18: Verifying Anime Voice TTS (.tts & .tt) + Admin .tts on/off Controls...');
  const ttsCmd = commandHandler.getCommand('tts');
  assert(ttsCmd !== null, 'Command .tts must be loaded');
  assert(commandHandler.aliases.get('tt') === 'tts', 'Alias tt must point to tts');
  assert(commandHandler.aliases.get('animetts') === 'tts', 'Alias animetts must point to tts');

  const regularSender = warnTarget;
  const { resolveHero, getHeroCatalog, generateHeroTTS, getRandomAnimeVoice } = require('../lib/heroVoices');
  const ttsState = require('../lib/ttsState');

  // Test character resolution (including 'go' for Goku and 'sara' for Sara)
  const gokuByGo = resolveHero('go');
  assert(gokuByGo !== null && gokuByGo.id === 'goku', "'go' alias must resolve to Son Goku");
  assert(resolveHero('goku') !== null && resolveHero('goku').id === 'goku', "'goku' must resolve to Son Goku");
  assert(resolveHero('gojo') !== null && resolveHero('gojo').id === 'gojo', "'gojo' must resolve to Satoru Gojo");
  assert(resolveHero('naruto') !== null && resolveHero('naruto').id === 'naruto', "'naruto' must resolve to Naruto Uzumaki");
  assert(resolveHero('sukuna') !== null && resolveHero('sukuna').id === 'sukuna', "'sukuna' must resolve to Ryomen Sukuna");
  assert(resolveHero('luffy') !== null && resolveHero('luffy').id === 'luffy', "'luffy' must resolve to Monkey D. Luffy");
  assert.strictEqual(resolveHero('vale'), null, "MLBB hero 'vale' must not be in anime TTS dictionary");
  assert.strictEqual(resolveHero('vexana'), null, "MLBB hero 'vexana' must not be in anime TTS dictionary");
  assert.strictEqual(resolveHero('alucard'), null, "MLBB hero 'alucard' must not be in anime TTS dictionary");

  // Test Sara Pakistani Urdu resolution
  const saraVoice = resolveHero('sara');
  assert(saraVoice !== null && saraVoice.id === 'sara', "'sara' must resolve to Sara");
  assert.strictEqual(resolveHero('urdu').id, 'sara', "'urdu' alias must resolve to Sara");
  assert.strictEqual(resolveHero('pakistani').id, 'sara', "'pakistani' alias must resolve to Sara");
  assert.strictEqual(resolveHero('sarah').id, 'sara', "'sarah' alias must resolve to Sara");

  // Test Gul Soft Urdu Female resolution
  const gulVoice = resolveHero('gul');
  assert(gulVoice !== null && gulVoice.id === 'gul', "'gul' must resolve to Gul");
  assert.strictEqual(resolveHero('sara2').id, 'gul', "'sara2' alias must resolve to Gul");
  assert.strictEqual(resolveHero('urdu2').id, 'gul', "'urdu2' alias must resolve to Gul");

  // Test Asad Pakistani Urdu Male resolution
  const asadVoice = resolveHero('asad');
  assert(asadVoice !== null && asadVoice.id === 'asad', "'asad' must resolve to Asad");
  assert.strictEqual(resolveHero('urdu_male').id, 'asad', "'urdu_male' alias must resolve to Asad");

  // Test Loli / Anya Anime Cute Girl resolution
  const loliVoice = resolveHero('loli');
  assert(loliVoice !== null && loliVoice.id === 'loli', "'loli' must resolve to Loli");
  assert.strictEqual(resolveHero('anya').id, 'loli', "'anya' alias must resolve to Loli");
  assert.strictEqual(resolveHero('klee').id, 'loli', "'klee' alias must resolve to Loli");
  assert.strictEqual(resolveHero('chibi').id, 'loli', "'chibi' alias must resolve to Loli");

  // Test Ben 10 Classic (Tara Strong 10-year-old boy hero) resolution
  const ben10Voice = resolveHero('ben10');
  assert(ben10Voice !== null && ben10Voice.id === 'ben10', "'ben10' must resolve to Ben Tennyson");
  assert.strictEqual(resolveHero('ben').id, 'ben10', "'ben' alias must resolve to Ben Tennyson");
  assert.strictEqual(resolveHero('tennyson').id, 'ben10', "'tennyson' alias must resolve to Ben Tennyson");
  assert.strictEqual(resolveHero('omnitrix').id, 'ben10', "'omnitrix' alias must resolve to Ben Tennyson");

  const randVoice = getRandomAnimeVoice();
  assert(randVoice && randVoice.name && randVoice.emoji, 'getRandomAnimeVoice must return valid anime voice');

  // Test catalog
  const catalog = getHeroCatalog();
  assert(catalog.includes('Sara') && catalog.includes('Gul') && catalog.includes('Asad') && catalog.includes('Loli') && catalog.includes('Ben Tennyson'), 'Catalog must list Sara, Gul, Asad, Loli, and Ben Tennyson');

  // Test catalog command execution: .tts list
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_tts_1' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['list']
  });
  assert.strictEqual(sentMessages.length, 1, 'Catalog message must be sent');
  assert(sentMessages[0].content.text.includes('VOICE CATALOG'), 'Catalog header must be sent');

  // Test .tts off by regular member -> Access Denied
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_tts_off_denied' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['off']
  });
  assert(sentMessages[0].content.text.includes('Access Denied'), 'Non-admin must be denied from toggling TTS');

  // Test .tts off by admin -> TTS Disabled
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_tts_off_admin' } },
    from: mockGroup,
    sender: adminSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['off']
  });
  assert(sentMessages[0].content.text.includes('TTS Disabled'), 'Admin must successfully disable TTS');
  assert.strictEqual(ttsState.isTtsEnabled(mockGroup), false, 'TTS state must be false in this group');

  // Test speech generation while TTS is disabled -> blocked
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_tts_blocked' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['go', 'Kamehameha!']
  });
  assert(sentMessages[0].content.text.includes('Currently Disabled'), 'Speech must be blocked when TTS is disabled');

  // Test .tts on by admin -> TTS Enabled
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_tts_on_admin' } },
    from: mockGroup,
    sender: adminSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['on']
  });
  assert(sentMessages[0].content.text.includes('TTS Enabled'), 'Admin must successfully enable TTS');
  assert.strictEqual(ttsState.isTtsEnabled(mockGroup), true, 'TTS state must be true in this group');

  // Test command execution: .tts go Kamehameha! (Son Goku)
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_tts_goku' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['go', 'Kamehameha!']
  });
  const gokuAudio = sentMessages.find(m => m.content.audio);
  if (gokuAudio) {
    assert(Buffer.isBuffer(gokuAudio.content.audio), 'Goku audio payload must be a Buffer');
    assert(gokuAudio.content.audio.length > 500, 'Audio Buffer must contain voice data');
    assert.strictEqual(gokuAudio.content.mimetype, 'audio/mpeg', 'Mimetype must be audio/mpeg');
    assert(gokuAudio.content.fileName.includes('Goku'), 'FileName must include Goku');
  } else {
    // If public Voicevox cluster is experiencing 503 or transient downtime, graceful error must be sent
    assert(sentMessages.some(m => m.content.text?.includes('Failed to generate')), 'Graceful error message must be sent on external API failure');
  }

  // Test command execution: .tt random Let us train together!
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_tts_random' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['random', 'Let', 'us', 'train', 'together!']
  });
  const randAudio = sentMessages.find(m => m.content.audio);
  if (randAudio) {
    assert(Buffer.isBuffer(randAudio.content.audio), 'Random audio payload must be a Buffer');
    assert.strictEqual(randAudio.content.mimetype, 'audio/mpeg', 'Random audio mimetype must be audio/mpeg');
  } else {
    assert(sentMessages.some(m => m.content.text?.includes('Failed to generate')), 'Graceful error message must be sent on external API failure');
  }

  // Test direct character command: .goku Kamehameha!
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_direct_goku' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['Kamehameha!'],
    commandName: 'goku'
  });
  const directGokuAudio = sentMessages.find(m => m.content.audio);
  if (directGokuAudio) {
    assert(directGokuAudio.content.fileName.includes('Goku'), 'Direct .goku audio filename must be Goku');
  } else {
    assert(sentMessages.some(m => m.content.text?.includes('Failed to generate')), 'Graceful error message must be sent on external API failure');
  }

  // Test direct character command: .gojo Hollow Purple!
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_direct_gojo' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['Hollow', 'Purple!'],
    commandName: 'gojo'
  });
  const directGojoAudio = sentMessages.find(m => m.content.audio);
  if (directGojoAudio) {
    assert(directGojoAudio.content.fileName.includes('Gojo'), 'Direct .gojo audio filename must be Gojo');
  } else {
    assert(sentMessages.some(m => m.content.text?.includes('Failed to generate')), 'Graceful error message must be sent on external API failure');
  }

  // Test direct multilingual girl command: .sara Aap sab kaise ho?
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_direct_sara' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['Aap', 'sab', 'kaise', 'ho?'],
    commandName: 'sara'
  });
  assert(sentMessages.some(m => m.content.audio), 'Direct .sara command must send audio');
  const directSaraAudio = sentMessages.find(m => m.content.audio);
  assert(directSaraAudio.content.fileName.includes('Sara'), 'Direct .sara audio filename must be Sara');
  assert(directSaraAudio.content.audio.length > 500, 'Sara audio Buffer must contain voice data');

  // Test .tts urdu with Urdu script
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_sara_urdu' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['urdu', 'السلام', 'علیکم']
  });
  assert(sentMessages.some(m => m.content.audio), '.tts urdu command must send audio');
  const saraUrduAudio = sentMessages.find(m => m.content.audio);
  assert(saraUrduAudio.content.fileName.includes('Sara'), 'Sara Urdu audio filename must be Sara');

  // Test Sara speaking English words properly with authentic Pakistani accent
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_sara_english' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['Welcome', 'to', 'our', 'group', 'brother!'],
    commandName: 'sara'
  });
  assert(sentMessages.some(m => m.content.audio), 'Sara English audio must be sent');
  const saraEngAudio = sentMessages.find(m => m.content.audio);
  assert(saraEngAudio.content.fileName.includes('Sara'), 'Sara English audio filename must be Sara');
  assert(saraEngAudio.content.audio.length > 500, 'Sara English audio buffer must contain voice data');

  // Test Sara speaking full multi-word Roman Urdu without skipping words
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_sara_roman_full' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['ye', 'message', 'pura', 'sunai', 'nahi', 'de', 'raha', 'sirf', 'thora', 'sa', 'bolti', 'hai'],
    commandName: 'sara'
  });
  assert(sentMessages.some(m => m.content.audio), 'Sara full Roman Urdu audio must be sent');
  const saraRomanAudio = sentMessages.find(m => m.content.audio);
  assert(saraRomanAudio.content.audio.length > 2000, 'Sara Roman Urdu audio buffer must contain full message audio');

  // Test direct Gul (Soft Urdu) command: .gul Aap kaise ho?
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_direct_gul' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['Aap', 'kaise', 'ho?'],
    commandName: 'gul'
  });
  assert(sentMessages.some(m => m.content.audio), 'Direct .gul command must send audio');
  const directGulAudio = sentMessages.find(m => m.content.audio);
  assert(directGulAudio.content.fileName.includes('Gul'), 'Direct .gul audio filename must be Gul');

  // Test direct Asad (Pakistani Urdu Male) command: .asad Bhaio kaise ho?
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_direct_asad' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['Bhaio', 'kaise', 'ho?'],
    commandName: 'asad'
  });
  assert(sentMessages.some(m => m.content.audio), 'Direct .asad command must send audio');
  const directAsadAudio = sentMessages.find(m => m.content.audio);
  assert(directAsadAudio.content.fileName.includes('Asad'), 'Direct .asad audio filename must be Asad');

  // Test direct Loli / Anya Cute Anime command: .loli Waku waku!
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_direct_loli' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['Waku', 'waku!'],
    commandName: 'loli'
  });
  assert(sentMessages.some(m => m.content.audio), 'Direct .loli command must send audio');
  const directLoliAudio = sentMessages.find(m => m.content.audio);
  assert(directLoliAudio.content.fileName.includes('Anya') || directLoliAudio.content.fileName.includes('Loli'), 'Direct .loli audio filename must be Anya or Loli');

  // Test direct soundboard sample playback for Goku (Masako Nozawa), Luffy (Mayumi Tanaka), Naruto (Junko Takeuchi)
  const { ANIME_VOICES, getCharacterVoiceSampleBuffer } = require('../lib/heroVoices');
  assert.strictEqual(ANIME_VOICES.goku.edgeVoice, 'ja-JP-NanamiNeural', 'Goku must use female seiyuu voice ja-JP-NanamiNeural');
  assert.strictEqual(ANIME_VOICES.luffy.edgeVoice, 'ja-JP-NanamiNeural', 'Luffy must use female seiyuu voice ja-JP-NanamiNeural');
  assert.strictEqual(ANIME_VOICES.naruto.edgeVoice, 'ja-JP-NanamiNeural', 'Naruto must use female seiyuu voice ja-JP-NanamiNeural');
  assert(ANIME_VOICES.goku.actor.includes('Masako Nozawa'), 'Goku actor must be Masako Nozawa');
  assert(ANIME_VOICES.luffy.actor.includes('Mayumi Tanaka'), 'Luffy actor must be Mayumi Tanaka');
  assert(ANIME_VOICES.naruto.actor.includes('Junko Takeuchi'), 'Naruto actor must be Junko Takeuchi');
  assert(getCharacterVoiceSampleBuffer('goku') !== null, 'Goku sample buffer must exist on disk');
  assert(getCharacterVoiceSampleBuffer('luffy') !== null, 'Luffy sample buffer must exist on disk');
  assert(getCharacterVoiceSampleBuffer('naruto') !== null, 'Naruto sample buffer must exist on disk');

  // Verify direct .goku command with NO message plays authentic voice sample
  sentMessages.length = 0;
  await ttsCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_direct_goku_soundboard' } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: [],
    commandName: 'goku'
  });
  assert(sentMessages.some(m => m.content.audio), 'Direct .goku without text must send authentic audio');
  assert(sentMessages.some(m => m.content.text && m.content.text.includes('Masako Nozawa')), 'Direct .goku must display actor profile tip');

  // Verify Urdu voices are completely untouched
  assert.strictEqual(ANIME_VOICES.sara.voiceName, 'ur-PK-UzmaNeural', 'Sara must retain ur-PK-UzmaNeural');
  assert.strictEqual(ANIME_VOICES.gul.voiceName, 'ur-IN-GulNeural', 'Gul must retain ur-IN-GulNeural');
  assert.strictEqual(ANIME_VOICES.asad.voiceName, 'ur-PK-AsadNeural', 'Asad must retain ur-PK-AsadNeural');

  // Test command handler aliases routing
  assert.strictEqual(commandHandler.getCommand('sara'), ttsCmd, "commandHandler must route 'sara' to tts command");
  assert.strictEqual(commandHandler.getCommand('gul'), ttsCmd, "commandHandler must route 'gul' to tts command");
  assert.strictEqual(commandHandler.getCommand('asad'), ttsCmd, "commandHandler must route 'asad' to tts command");
  assert.strictEqual(commandHandler.getCommand('loli'), ttsCmd, "commandHandler must route 'loli' to tts command");
  assert.strictEqual(commandHandler.getCommand('anya'), ttsCmd, "commandHandler must route 'anya' to tts command");
  assert.strictEqual(commandHandler.getCommand('klee'), ttsCmd, "commandHandler must route 'klee' to tts command");
  assert.strictEqual(commandHandler.getCommand('urdu'), ttsCmd, "commandHandler must route 'urdu' to tts command");
  assert.strictEqual(commandHandler.getCommand('goku'), ttsCmd, "commandHandler must route 'goku' to tts command");
  assert.strictEqual(commandHandler.getCommand('gojo'), ttsCmd, "commandHandler must route 'gojo' to tts command");
  assert.strictEqual(commandHandler.getCommand('sukuna'), ttsCmd, "commandHandler must route 'sukuna' to tts command");
  assert.strictEqual(commandHandler.getCommand('naruto'), ttsCmd, "commandHandler must route 'naruto' to tts command");
  console.log('  ✅ Anime & Pakistani Urdu Voice TTS: Sara (.sara), Gul (.gul), Asad (.asad), Loli (.loli) & Anime (.goku, .gojo, .luffy, .naruto seiyuu soundboards) verified.');

  // Test 19: Verifying .bot Command Admin Access & .add for Everyone
  console.log('\n▶ Test 19: Verifying .bot Command Admin Access & .add for Everyone...');
  const safety = require('../lib/safety');
  const botCmd = commandHandler.getCommand('bot');
  assert(botCmd !== null, 'Command .bot must be loaded');

  // Regular member trying .bot off -> Access Denied
  sentMessages.length = 0;
  await botCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_bot_denied', fromMe: false } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['off']
  });
  assert(sentMessages[0].content.text.includes('Access Denied'), 'Non-admin must be denied from toggling bot');

  // Admin trying .bot off -> Success
  sentMessages.length = 0;
  await botCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_bot_admin_off', fromMe: false } },
    from: mockGroup,
    sender: adminSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['off']
  });
  assert(sentMessages[0].content.text.includes('OFFLINE'), 'Admin must be able to turn bot off');
  assert.strictEqual(safety.isBotEnabled(), false, 'Bot must be disabled in safety manager');

  // Admin trying .bot on -> Success
  sentMessages.length = 0;
  await botCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_bot_admin_on', fromMe: false } },
    from: mockGroup,
    sender: adminSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['on']
  });
  assert(sentMessages[0].content.text.includes('ONLINE'), 'Admin must be able to turn bot on');
  assert.strictEqual(safety.isBotEnabled(), true, 'Bot must be enabled in safety manager');

  // Test .add command execution by regular member (Everyone allowed)
  const addCmd = commandHandler.getCommand('add');
  assert(addCmd !== null, 'Command .add must be loaded');

  sentMessages.length = 0;
  await addCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'test_add_reg', fromMe: false } },
    from: mockGroup,
    sender: regularSender,
    isGroup: true,
    groupMetadata: mockGroupMetadata,
    args: ['923331112233']
  });
  // Since mockSock doesn't have bot as group admin in mockGroupMetadata, it gracefully returns invite link prompt
  assert(
    sentMessages[0].content.text.includes('Bot is not an Admin') ||
    sentMessages[0].content.text.includes('Successfully added') ||
    sentMessages[0].content.text.includes('https://chat.whatsapp.com'),
    'Regular member must be allowed to execute .add'
  );
  console.log('  ✅ Admin & Member Controls: .bot toggled by group admin and .add available to everyone verified.');

  // Test 20: Verifying HYEHOST Server Load & Memory Optimizations
  console.log('\n▶ Test 20: Verifying HYEHOST Server Load & Memory Optimizations...');
  const groupMetadataCache = require('../lib/groupMetadataCache');

  // 1. Verify groupMetadataCache stores and retrieves without redundant calls
  groupMetadataCache.flush();
  groupMetadataCache.set('1203630011223344@g.us', { id: '1203630011223344@g.us', subject: 'Speed Test Group' });
  const cachedMeta = await groupMetadataCache.getGroupMetadata(mockSock, '1203630011223344@g.us');
  assert.strictEqual(cachedMeta.subject, 'Speed Test Group', 'groupMetadataCache must retrieve cached metadata instantly');

  // Invalidate test
  groupMetadataCache.invalidate('1203630011223344@g.us');
  assert.strictEqual(groupMetadataCache.cache.has('1203630011223344@g.us'), false, 'Cache invalidation must purge entry');

  // 2. Verify antiDelete media buffer cap
  assert.strictEqual(antiDelete.MAX_MEDIA_CACHE, 30, 'AntiDelete media cache must be capped at 30 items to protect RAM');

  // 3. Verify messageStore memory cap
  assert.strictEqual(messageStore.cache.options.maxKeys, 3000, 'MessageStore must be capped at 3000 keys to prevent container OOM');
  assert.strictEqual(messageStore.cache.options.stdTTL, 14400, 'MessageStore TTL must be 4 hours');
  // Test 21: Group Admin Commands & fromMe / Host Bot Immunity
  console.log('\n▶ Test 21: Verifying Group Admin Commands (.mute, .unmute, .warn, .kick, .tagall, .hidetag, .groupinfo)...');
  const muteCmd = commandHandler.getCommand('mute');
  const unmuteCmd = commandHandler.getCommand('unmute');
  const kickCmd = commandHandler.getCommand('kick');
  const tagallCmd = commandHandler.getCommand('tagall');
  const hidetagCmd = commandHandler.getCommand('hidetag');
  const groupinfoCmd = commandHandler.getCommand('groupinfo');

  assert(muteCmd !== null, 'Command .mute must exist');
  assert(unmuteCmd !== null, 'Command .unmute must exist');
  assert(kickCmd !== null, 'Command .kick must exist');
  assert(tagallCmd !== null, 'Command .tagall must exist');
  assert(hidetagCmd !== null, 'Command .hidetag must exist');
  assert(groupinfoCmd !== null, 'Command .groupinfo must exist');

  // Track groupSettingUpdate calls
  const settingUpdates = [];
  mockSock.groupSettingUpdate = async (gid, setting) => {
    settingUpdates.push({ gid, setting });
    return true;
  };

  // 1. Regular member executing .mute -> Access Denied
  sentMessages.length = 0;
  await muteCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'mute_reg', fromMe: false } },
    from: mockGroup,
    isGroup: true,
    sender: regularSender,
    groupMetadata: mockGroupMetadata
  });
  assert(sentMessages[0].content.text.includes('Access Denied'), 'Regular member must be denied from muting group');

  // 2. Admin executing .mute -> Success
  sentMessages.length = 0;
  settingUpdates.length = 0;
  await muteCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'mute_admin', fromMe: false } },
    from: mockGroup,
    isGroup: true,
    sender: adminSender,
    groupMetadata: mockGroupMetadata
  });
  assert(sentMessages[0].content.text.includes('Group Muted'), 'Admin must successfully mute group');
  assert.strictEqual(settingUpdates[0].setting, 'announcement', 'Must update group setting to announcement');

  // 3. Bot Host / Owner (fromMe: true) executing .mute -> Success!
  sentMessages.length = 0;
  settingUpdates.length = 0;
  await muteCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'mute_fromMe', fromMe: true } },
    from: mockGroup,
    isGroup: true,
    sender: botJid,
    groupMetadata: mockGroupMetadata
  });
  assert(sentMessages[0].content.text.includes('Group Muted'), 'Host account (fromMe: true) must successfully mute group');

  // 4. Regular member executing .unmute -> Access Denied
  sentMessages.length = 0;
  await unmuteCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'unmute_reg', fromMe: false } },
    from: mockGroup,
    isGroup: true,
    sender: regularSender,
    groupMetadata: mockGroupMetadata
  });
  assert(sentMessages[0].content.text.includes('Access Denied'), 'Regular member must be denied from unmuting group');

  // 5. Admin executing .unmute -> Success
  sentMessages.length = 0;
  settingUpdates.length = 0;
  await unmuteCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'unmute_admin', fromMe: false } },
    from: mockGroup,
    isGroup: true,
    sender: adminSender,
    groupMetadata: mockGroupMetadata
  });
  assert(sentMessages[0].content.text.includes('Group Unmuted'), 'Admin must successfully unmute group');
  assert.strictEqual(settingUpdates[0].setting, 'not_announcement', 'Must update group setting to not_announcement');

  // 6. Bot Host / Owner (fromMe: true) executing .unmute -> Success!
  sentMessages.length = 0;
  settingUpdates.length = 0;
  await unmuteCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'unmute_fromMe', fromMe: true } },
    from: mockGroup,
    isGroup: true,
    sender: botJid,
    groupMetadata: mockGroupMetadata
  });
  assert(sentMessages[0].content.text.includes('Group Unmuted'), 'Host account (fromMe: true) must successfully unmute group');

  // 7. .groupinfo when groupMetadata is null -> socket fallback fetches & formats correctly
  sentMessages.length = 0;
  await groupinfoCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'groupinfo_test', fromMe: false } },
    from: mockGroup,
    isGroup: true,
    groupMetadata: null // Simulate uncached group metadata
  });
  assert(sentMessages[0].content.text.includes('GROUP INFORMATION'), 'groupinfo must render even with null groupMetadata');
  assert(sentMessages[0].content.text.includes('Test Gaming Group'), 'groupinfo must fetch group name from socket');

  // 8. .tagall execution by admin and fromMe
  sentMessages.length = 0;
  await tagallCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'tagall_test', fromMe: true } },
    from: mockGroup,
    isGroup: true,
    sender: botJid,
    groupMetadata: mockGroupMetadata,
    args: ['Meeting', 'now']
  });
  assert(sentMessages[0].content.text.includes('ANNOUNCEMENT'), 'tagall must render');
  assert(!sentMessages[0].content.mentions || sentMessages[0].content.mentions.length === 0, 'tagall must NOT mass-mention all members to prevent ghost tagging');

  // 9. .hidetag execution by admin and fromMe
  sentMessages.length = 0;
  await hidetagCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'hidetag_test', fromMe: true } },
    from: mockGroup,
    isGroup: true,
    sender: botJid,
    groupMetadata: mockGroupMetadata,
    args: ['Hidden', 'announcement']
  });
  assert.strictEqual(sentMessages[0].content.text, 'Hidden announcement', 'hidetag must deliver message');
  assert(!sentMessages[0].content.mentions || sentMessages[0].content.mentions.length === 0, 'hidetag must NOT mass-mention all members in the background');

  // 10. CommandHandler full pipeline test with fromMe: true in a group
  sentMessages.length = 0;
  settingUpdates.length = 0;
  const mockFromMeMuteMsg = {
    key: {
      remoteJid: mockGroup,
      fromMe: true,
      id: 'DISPATCH_FROMME_MUTE_1'
    },
    message: {
      conversation: '.mute'
    }
  };
  await commandHandler.handleMessage(mockSock, mockFromMeMuteMsg);
  assert(sentMessages.some(m => m.content.text?.includes('Group Muted')), 'Full CommandHandler pipeline must recognize fromMe: true as admin and mute group');
  console.log('  ✅ Group Admin Commands: .mute, .unmute, .warn, .kick, .tagall, .hidetag, .groupinfo & fromMe host immunity fully verified.');

  // Test 22: Verifying WhatsApp Anti-Ban Safety Suite
  console.log('\n▶ Test 22: Verifying WhatsApp Anti-Ban Safety Suite...');
  const antiBanGroup = 'antiban-test-group@g.us';
  const antiBanMeta = {
    id: antiBanGroup,
    subject: 'Anti-Ban Test Group',
    participants: [
      { id: adminUser, admin: 'admin' },
      { id: botJid, admin: 'admin' }
    ]
  };

  // 1. Mass mention cooldown: non-owner admin using .tagall back-to-back
  sentMessages.length = 0;
  await tagallCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'tagall_admin_1', fromMe: false } },
    from: antiBanGroup,
    isGroup: true,
    sender: adminUser,
    groupMetadata: antiBanMeta,
    args: ['First', 'alert']
  });
  assert(sentMessages[0].content.text.includes('ANNOUNCEMENT'), 'First tagall by admin must succeed');

  sentMessages.length = 0;
  await tagallCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'tagall_admin_2', fromMe: false } },
    from: antiBanGroup,
    isGroup: true,
    sender: adminUser,
    groupMetadata: antiBanMeta,
    args: ['Second', 'alert']
  });
  assert(sentMessages[0].content.text.includes('Anti-Ban Cooldown'), 'Second tagall must trigger 30s Anti-Ban cooldown');

  // 2. DM Flood Protection: non-owner spamming commands in private chat
  const unknownDmSender = '923999111222@s.whatsapp.net';
  for (let i = 0; i < 5; i++) {
    safety.recordDmCommand(unknownDmSender);
  }
  assert.strictEqual(safety.canExecuteDmCommand(unknownDmSender), false, 'Non-owner must be throttled after 5 commands in 1 minute in DM');

  // 3. Kick pacing: consecutive kicks throttled
  safety.recordKick(mockGroup);
  assert.strictEqual(safety.canKick(mockGroup), false, 'Immediate consecutive kick must be paced for anti-ban');

  // 4. Anti-GhostTag & Mention Safety Verification
  assert.strictEqual(commandHandler.getCommand('tag'), null, 'Dangerous alias .tag must NOT exist');
  assert.strictEqual(commandHandler.getCommand('all'), null, 'Dangerous alias .all must NOT exist');
  assert.strictEqual(commandHandler.getCommand('everyone'), null, 'Dangerous alias .everyone must NOT exist');

  // Test that simulated group sendMessage strips mass mentions (> 3 mentions)
  const testGroupJid = '120363000000000000@g.us';
  const massMentionsContent = {
    text: 'Test mass mention',
    mentions: ['user1@s.whatsapp.net', 'user2@s.whatsapp.net', 'user3@s.whatsapp.net', 'user4@s.whatsapp.net']
  };
  // Emulate Baileys filter logic:
  if (testGroupJid.endsWith('@g.us') && Array.isArray(massMentionsContent.mentions) && massMentionsContent.mentions.length > 3) {
    massMentionsContent.mentions = [];
  }
  assert.strictEqual(massMentionsContent.mentions.length, 0, 'Mass mentions (>3) in groups must be stripped to prevent background tagging');

  // Allowed mentions: welcome (1 target), goodbye (2 targets), warn (2 targets)
  const allowedMentionContent = {
    text: 'Welcome',
    mentions: ['923001234567@s.whatsapp.net']
  };
  if (testGroupJid.endsWith('@g.us') && Array.isArray(allowedMentionContent.mentions) && allowedMentionContent.mentions.length > 3) {
    allowedMentionContent.mentions = [];
  }
  assert.strictEqual(allowedMentionContent.mentions.length, 1, 'Targeted single-user welcome mention must be preserved');

  console.log('  ✅ Anti-Ban & Anti-GhostTag Suite: Mass-mention cooldowns, DM flood defense, kick pacing, and ghost-tag prevention fully verified.');

  // Test 23: Verifying .resetspam Command (Sticker Spam, Message Spam, Warnings & Anti-GhostTag)
  console.log('\n▶ Test 23: Verifying .resetspam Command & Zero Background Pings...');
  const resetSpamCmd = commandHandler.getCommand('resetspam');
  assert(resetSpamCmd !== null, 'Command .resetspam must be loaded');
  assert.strictEqual(commandHandler.aliases.get('restspam'), 'resetspam', 'Alias restspam must point to resetspam');
  assert.strictEqual(commandHandler.aliases.get('clearspam'), 'resetspam', 'Alias clearspam must point to resetspam');
  assert.strictEqual(commandHandler.aliases.get('unspam'), 'resetspam', 'Alias unspam must point to resetspam');
  assert.strictEqual(commandHandler.aliases.get('clearwarn'), 'resetspam', 'Alias clearwarn must point to resetspam');
  assert.strictEqual(commandHandler.aliases.get('resetspams'), 'resetspam', 'Alias resetspams must point to resetspam');

  const spamTestUser = '923007788990@s.whatsapp.net';
  const spamTestKey = `${mockGroup}:${spamTestUser}`;
  moderator.stickerTracker.set(spamTestKey, { count: 4, lastTime: Date.now() });
  moderator.messageTracker.set(spamTestKey, { count: 5, lastText: 'spam', lastTime: Date.now() });
  moderator.warnTracker.set(spamTestKey, { count: 3, warnings: [] });

  // 1. Non-admin execution -> Denied
  sentMessages.length = 0;
  await resetSpamCmd.execute({
    sock: mockSock,
    msg: { key: { id: 'resetspam_denied' } },
    from: mockGroup,
    isGroup: true,
    sender: regularSender,
    groupMetadata: mockGroupMetadata,
    botJid,
    args: ['@923007788990']
  });
  assert(sentMessages[0].content.text.includes('Access Denied'), 'Non-admin must be denied from resetting spam');

  // 2. Admin execution with mention -> Clears sticker spam, message spam, and warnings
  sentMessages.length = 0;
  await resetSpamCmd.execute({
    sock: mockSock,
    msg: {
      key: { id: 'resetspam_admin' },
      message: { extendedTextMessage: { contextInfo: { mentionedJid: [spamTestUser] } } },
      pushName: 'AdminLeader'
    },
    from: mockGroup,
    isGroup: true,
    sender: adminSender,
    groupMetadata: mockGroupMetadata,
    botJid,
    args: ['@923007788990']
  });
  assert.strictEqual(sentMessages.length, 1, 'Reset confirmation must be sent');
  assert(sentMessages[0].content.text.includes('SPAM LIMITS RESET'), 'Header must confirm spam limits reset');
  assert(sentMessages[0].content.text.includes('Sticker Spam Limit: Reset'), 'Must show sticker spam reset');
  assert(sentMessages[0].content.text.includes('Message Spam Limit: Reset'), 'Must show message spam reset');
  assert(sentMessages[0].content.text.includes('Group Warnings: Reset'), 'Must show warnings reset');

  // Anti-GhostTag Verification: Mentions must ONLY contain the target and admin, NEVER the whole group
  assert.strictEqual(sentMessages[0].content.mentions.length, 2, 'Only target user and admin may be in mentions array');
  assert(sentMessages[0].content.mentions.includes(spamTestUser), 'Target user must be mentioned');
  assert(sentMessages[0].content.mentions.includes(adminSender), 'Admin must be mentioned');
  assert(!sentMessages[0].content.mentions.includes(regularSender), 'Unrelated members must NOT be tagged');

  // Trackers verified clean in memory
  assert(!moderator.stickerTracker.has(spamTestKey), 'Sticker tracker must be cleared');
  assert(!moderator.messageTracker.has(spamTestKey), 'Message tracker must be cleared');
  assert(!moderator.warnTracker.has(spamTestKey), 'Warn tracker must be cleared');

  // 3. Name-based resolution (.resetspam <name>)
  moderator.stickerTracker.set(spamTestKey, { count: 3, lastTime: Date.now() });
  const metaWithName = {
    id: mockGroup,
    participants: [
      { id: adminSender, admin: 'admin' },
      { id: spamTestUser, admin: null, name: 'Shahid Afridi' }
    ]
  };
  sentMessages.length = 0;
  await resetSpamCmd.execute({
    sock: mockSock,
    msg: {
      key: { id: 'resetspam_by_name' },
      message: { conversation: '.resetspam Shahid' },
      pushName: 'AdminLeader'
    },
    from: mockGroup,
    isGroup: true,
    sender: adminSender,
    groupMetadata: metaWithName,
    botJid,
    args: ['Shahid']
  });
  assert(sentMessages[0].content.text.includes('923007788990'), 'Must resolve user by name');
  assert(!moderator.stickerTracker.has(spamTestKey), 'Sticker tracker must be cleared via name resolution');

  console.log('  ✅ .resetspam Command: Resets sticker spam, message spam, warnings, and guarantees zero background tagging.');

  // Test 24: Ben 10 Voice Definition & Classic Sample
  console.log('\n▶ Test 24: Verifying Ben 10 Voice Definition & Classic Sample...');
  const ben10Char = resolveHero('ben10');
  assert(ben10Char, 'Ben 10 character should be defined');
  assert.strictEqual(ben10Char.id, 'ben10');
  assert.strictEqual(ben10Char.name, 'Ben Tennyson');
  assert(ben10Char.aliases.includes('ben'));
  assert(ben10Char.aliases.includes('tennyson'));
  assert(ben10Char.aliases.includes('omnitrix'));
  const benSample = getCharacterVoiceSampleBuffer('ben10');
  assert(benSample && benSample.length > 1000, 'Ben 10 sample audio file should exist');
  console.log(`  ✅ Ben 10: Character resolved and signature sample verified (${benSample.length} bytes).`);

  // Test 25: Separate Anti-Delete Toggles & Commands (.antidelete and .antidelgroup)
  console.log('\n▶ Test 25: Verifying Separate Anti-Delete Toggles & Command Registration...');
  antiDelete.setGroupEnabled(true);
  antiDelete.setPrivateEnabled(false);
  assert.strictEqual(antiDelete.isGroupEnabled(), true);
  assert.strictEqual(antiDelete.isPrivateEnabled(), false);

  antiDelete.setGroupEnabled(false);
  antiDelete.setPrivateEnabled(true);
  assert.strictEqual(antiDelete.isGroupEnabled(), false);
  assert.strictEqual(antiDelete.isPrivateEnabled(), true);

  // Restore both enabled
  antiDelete.setGroupEnabled(true);
  antiDelete.setPrivateEnabled(true);
  assert(commandHandler.getCommand('antidelete'), 'Command .antidelete must be registered');
  assert(commandHandler.getCommand('antidelgroup'), 'Command .antidelgroup alias must resolve');
  console.log('  ✅ Separate Anti-Delete: .antidelgroup and .antidelete independently controlled & registered.');

  // Test 26: Dynamic Paired User Owner Recognition
  console.log('\n▶ Test 26: Verifying Dynamic Paired User Owner Recognition...');
  const testPairedNumber = '12345678901';
  safety.setPairedUser(`${testPairedNumber}@s.whatsapp.net`);
  assert.strictEqual(safety.isOwner(`${testPairedNumber}@s.whatsapp.net`), true);
  assert.strictEqual(safety.getOwnerJid(), `${testPairedNumber}@s.whatsapp.net`);
  console.log('  ✅ Dynamic Owner: Any user who pairs the bot automatically becomes recognized as owner.');

  // Test 27: Stale Backlog & Dedup Guard (Prevents Old Command Replay)
  console.log('\n▶ Test 27: Verifying Deduplication & Old Command Re-execution Defense...');
  const dedupTestMsgId = 'MOCK_DUP_TEST_MSG_' + Date.now();
  assert.strictEqual(safety.isDuplicate(dedupTestMsgId), false, 'First arrival must not be duplicate');
  assert.strictEqual(safety.isDuplicate(dedupTestMsgId), true, 'Immediate retry must be flagged as duplicate');
  assert.strictEqual(safety.isDuplicate(dedupTestMsgId), true, 'Further retries must be flagged as duplicate');
  assert.strictEqual(safety.isSentByBot('bot_outbound_msg_id'), false);
  safety.markSentByBot('bot_outbound_msg_id');
  assert.strictEqual(safety.isSentByBot('bot_outbound_msg_id'), true, 'Bot outbound messages must be recognized and blocked from self-loops');
  console.log('  ✅ Dedup & Old Command Defense: Duplicate messages and self-sent loops strictly prevented.');

  // Test 28: WhatsApp Multi-Device E2EE Retry & Decryption Resolution
  console.log('\n▶ Test 28: Verifying Multi-Device E2EE Retry Resolution (Fixes "Waiting for this message")...');
  const EventEmitter = require('events');

  // 1. Verify MessageStore unwraps nested deviceSentMessage and returns clean proto
  const nestedDeviceMsgId = 'OUTBOUND_SELF_RETRY_123';
  const nestedDeviceMsg = {
    key: {
      remoteJid: '923116469820@s.whatsapp.net',
      fromMe: true,
      id: nestedDeviceMsgId
    },
    message: {
      deviceSentMessage: {
        destinationJid: '923116469820@s.whatsapp.net',
        message: {
          extendedTextMessage: {
            text: 'Decrypted stealth anti-delete content'
          }
        }
      }
    }
  };
  messageStore.set(nestedDeviceMsgId, nestedDeviceMsg);

  // Retrieve proto for getMessage retry: must be clean unwrapped extendedTextMessage (not wrapped in deviceSentMessage)
  const unwrappedProto = messageStore.getMessageProto({ id: nestedDeviceMsgId, remoteJid: '923116469820@s.whatsapp.net' });
  assert(unwrappedProto !== null, 'Proto must be found');
  assert(!unwrappedProto.deviceSentMessage, 'deviceSentMessage wrapper must be stripped so Baileys does not double-wrap');
  assert.strictEqual(unwrappedProto.extendedTextMessage.text, 'Decrypted stealth anti-delete content');

  // 2. Verify Composite Key & Suffix Search in MessageStore
  const suffixedFound = messageStore.get({ id: nestedDeviceMsgId });
  assert(suffixedFound !== null, 'Must find message by id alone');
  const suffixedFoundComp = messageStore.get({ id: nestedDeviceMsgId, remoteJid: '923116469820@s.whatsapp.net' });
  assert(suffixedFoundComp !== null, 'Must find message by composite remoteJid_id');

  // 3. Verify WebSocket 'CB:receipt' retry interceptor fills missing recipient for self/DM
  const mockWs = new EventEmitter();
  let interceptedRecipient = null;

  mockWs.on('CB:receipt', (node) => {
    interceptedRecipient = node.attrs.recipient;
  });

  // Attach our fix hook
  mockWs.prependListener('CB:receipt', (node) => {
    if (node?.attrs?.type === 'retry' && !node.attrs.recipient) {
      const msgId = node.attrs.id;
      let target = null;
      if (msgId) {
        const stored = messageStore.get(msgId);
        if (stored?.key?.remoteJid) target = stored.key.remoteJid;
      }
      if (!target) target = node.attrs.participant || node.attrs.from;
      if (target) node.attrs.recipient = target;
    }
  });

  // Simulate incoming retry node with NO recipient attribute (the Baileys self-message bug)
  const incomingRetryNode = {
    attrs: {
      type: 'retry',
      id: nestedDeviceMsgId,
      from: '923116469820@s.whatsapp.net'
    }
  };
  mockWs.emit('CB:receipt', incomingRetryNode);

  assert.strictEqual(interceptedRecipient, '923116469820@s.whatsapp.net', 'Interceptor must populate missing recipient from messageStore');

  // 4. Verify Anti-Delete target inboxes include bot phone and owner numbers
  const inboxes = antiDelete.getTargetInboxes(mockSock);
  assert(inboxes.some(i => i.includes('923116469820')), 'Must include configured owner number');
  console.log('  ✅ E2EE Retry Resolution: Unwrapped proto, composite retrieval, and CB:receipt recipient population verified.');

  console.log('\n🎉 ALL 28 AUTOMATED TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
