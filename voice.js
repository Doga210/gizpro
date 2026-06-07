var voiceState = {
  localStream: null,
  peerConnection: null,
  currentCallUser: null,
  isCalling: false,
  isReceiving: false,
  callListener: null,
  answerListener: null,
  candidateListener: null
};
var ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};
async function getReferrals() {
  if (!currentUser) return [];
  try {
    var snap = await db.collection('users')
      .where('referredBy', '==', String(currentUser.userId || currentUser.username))
      .get();
    return snap.docs.map(function(d) {
      return { username: d.id };
    });
  } catch(e) { return []; }
}
async function openVoiceScreen() {
  if (!currentUser) return;
  showScreen('voice-screen');
  var list = document.getElementById('voice-referrals-list');
  list.innerHTML = '<div style="text-align:center;padding:1rem;color:#888">جاري التحميل...</div>';
  var referrals = await getReferrals();
  if (referrals.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:2rem;color:#888">لا توجد احالات بعد</div>';
    return;
  }
  list.innerHTML = referrals.map(function(ref) {
    return '<div class="referral-call-item"><div class="referral-call-info"><div class="referral-call-avatar"><i class="fas fa-user"></i></div><div class="referral-call-name">' + ref.username + '</div></div><button class="btn-call" onclick="startCall(\'' + ref.username + '\')"><i class="fas fa-phone"></i></button></div>';
  }).join('');
  listenForIncomingCalls();
}
function listenForIncomingCalls() {
  if (!currentUser) return;
  if (voiceState.callListener) voiceState.callListener();
  voiceState.callListener = db.collection('calls').doc(currentUser.username)
    .onSnapshot(function(doc) {
      if (!doc.exists) return;
      var data = doc.data();
      if (data && data.type === 'offer' && !voiceState.isCalling) {
        showIncomingCall(data.from, data.offer);
      }
    });
}
function showIncomingCall(fromUser, offer) {
  voiceState.isReceiving = true;
  voiceState.currentCallUser = fromUser;
  voiceState.pendingOffer = offer;
  var modal = document.getElementById('incoming-call-modal');
  var callerName = document.getElementById('caller-name');
  if (callerName) callerName.textContent = fromUser;
  if (modal) modal.classList.add('active');
}
async function rejectCall() {
  var modal = document.getElementById('incoming-call-modal');
  if (modal) modal.classList.remove('active');
  voiceState.isReceiving = false;
  voiceState.currentCallUser = null;
  await db.collection('calls').doc(currentUser.username).delete();
}
function listenForIncomingCalls() {
  if (!currentUser) return;
  if (voiceState.callListener) voiceState.callListener();
  voiceState.callListener = db.collection('calls').doc(currentUser.username)
    .onSnapshot(function(doc) {
      if (!doc.exists) return;
      var data = doc.data();
      if (data && data.type === 'offer' && !voiceState.isCalling) {
        showIncomingCall(data.from, data.offer);
      }
    });
}
function showIncomingCall(fromUser, offer) {
  voiceState.isReceiving = true;
  voiceState.currentCallUser = fromUser;
  voiceState.pendingOffer = offer;
  var modal = document.getElementById('incoming-call-modal');
  var callerName = document.getElementById('caller-name');
  if (callerName) callerName.textContent = fromUser;
  if (modal) modal.classList.add('active');
}
async function rejectCall() {
  var modal = document.getElementById('incoming-call-modal');
  if (modal) modal.classList.remove('active');
  voiceState.isReceiving = false;
  voiceState.currentCallUser = null;
  await db.collection('calls').doc(currentUser.username).delete();
}
async function acceptCall() {
  var modal = document.getElementById('incoming-call-modal');
  if (modal) modal.classList.remove('active');
  try {
    voiceState.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceState.peerConnection = new RTCPeerConnection(ICE_SERVERS);
    voiceState.localStream.getTracks().forEach(function(track) {
      voiceState.peerConnection.addTrack(track, voiceState.localStream);
    });
    voiceState.peerConnection.ontrack = function(event) {
      var audio = document.getElementById('remote-audio');
      if (audio) audio.srcObject = event.streams[0];
    };
    voiceState.peerConnection.onicecandidate = function(event) {
      if (event.candidate) {
        db.collection('candidates')
          .doc(voiceState.currentCallUser + '_to_' + currentUser.username)
          .collection('list').add(event.candidate.toJSON());
      }
    };
    await voiceState.peerConnection.setRemoteDescription(new RTCSessionDescription(voiceState.pendingOffer));
    var answer = await voiceState.peerConnection.createAnswer();
    await voiceState.peerConnection.setLocalDescription(answer);
    await db.collection('calls').doc(voiceState.currentCallUser).set({
      type: 'answer', from: currentUser.username,
      answer: { type: answer.type, sdp: answer.sdp }
    });
    listenForCandidates(voiceState.currentCallUser, currentUser.username);
    showCallScreen(voiceState.currentCallUser);
  } catch(e) {
    showToast('تعذر الوصول للميكروفون', 'error');
    rejectCall();
  }
}
async function startCall(targetUsername) {
  if (voiceState.isCalling) { showToast('انت في مكالمة بالفعل', 'warning'); return; }
  voiceState.isCalling = true;
  voiceState.currentCallUser = targetUsername;
  try {
    voiceState.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceState.peerConnection = new RTCPeerConnection(ICE_SERVERS);
    voiceState.localStream.getTracks().forEach(function(track) {
      voiceState.peerConnection.addTrack(track, voiceState.localStream);
    });
    voiceState.peerConnection.ontrack = function(event) {
      var audio = document.getElementById('remote-audio');
      if (audio) audio.srcObject = event.streams[0];
    };
    voiceState.peerConnection.onicecandidate = function(event) {
      if (event.candidate) {
        db.collection('candidates')
          .doc(currentUser.username + '_to_' + targetUsername)
          .collection('list').add(event.candidate.toJSON());
      }
    };
    var offer = await voiceState.peerConnection.createOffer();
    await voiceState.peerConnection.setLocalDescription(offer);
    await db.collection('calls').doc(targetUsername).set({
      type: 'offer', from: currentUser.username,
      offer: { type: offer.type, sdp: offer.sdp }
    });
    showOutgoingCallScreen(targetUsername);
    waitForAnswer(targetUsername);
  } catch(e) {
    showToast('تعذر الوصول للميكروفون', 'error');
    voiceState.isCalling = false;
  }
}
function waitForAnswer(targetUsername) {
  if (voiceState.answerListener) voiceState.answerListener();
  voiceState.answerListener = db.collection('calls').doc(currentUser.username)
    .onSnapshot(async function(doc) {
      if (!doc.exists) return;
      var data = doc.data();
      if (data && data.type === 'answer' && voiceState.peerConnection) {
        await voiceState.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        listenForCandidates(currentUser.username, targetUsername);
        showCallScreen(targetUsername);
      }
    });
}
function listenForCandidates(fromUser, toUser) {
  if (voiceState.candidateListener) voiceState.candidateListener();
  voiceState.candidateListener = db.collection('candidates')
    .doc(fromUser + '_to_' + toUser).collection('list')
    .onSnapshot(function(snap) {
      snap.docChanges().forEach(async function(change) {
        if (change.type === 'added' && voiceState.peerConnection) {
          try {
            await voiceState.peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()));
          } catch(e) {}
        }
      });
    });
}
async function endCall() {
  if (voiceState.localStream) {
    voiceState.localStream.getTracks().forEach(function(t) { t.stop(); });
    voiceState.localStream = null;
  }
  if (voiceState.peerConnection) {
    voiceState.peerConnection.close();
    voiceState.peerConnection = null;
  }
  if (currentUser && voiceState.currentCallUser) {
    await db.collection('calls').doc(currentUser.username).delete().catch(function(){});
    await db.collection('calls').doc(voiceState.currentCallUser).delete().catch(function(){});
  }
  if (voiceState.answerListener) { voiceState.answerListener(); voiceState.answerListener = null; }
  if (voiceState.candidateListener) { voiceState.candidateListener(); voiceState.candidateListener = null; }
  voiceState.isCalling = false;
  voiceState.isReceiving = false;
  voiceState.currentCallUser = null;
  var s1 = document.getElementById('active-call-screen');
  var s2 = document.getElementById('outgoing-call-screen');
  if (s1) s1.classList.remove('active');
  if (s2) s2.classList.remove('active');
  showToast('انتهت المكالمة');
}
function toggleMute() {
  if (!voiceState.localStream) return;
  var audioTrack = voiceState.localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    var btn = document.getElementById('mute-btn');
    if (btn) {
      btn.innerHTML = audioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
      btn.classList.toggle('muted', !audioTrack.enabled);
    }
  }
}
function showOutgoingCallScreen(targetUsername) {
  var screen = document.getElementById('outgoing-call-screen');
  var name = document.getElementById('outgoing-call-name');
  if (name) name.textContent = targetUsername;
  if (screen) screen.classList.add('active');
}
function showCallScreen(targetUsername) {
  var outgoing = document.getElementById('outgoing-call-screen');
  if (outgoing) outgoing.classList.remove('active');
  var screen = document.getElementById('active-call-screen');
  var name = document.getElementById('active-call-name');
  if (name) name.textContent = targetUsername;
  if (screen) screen.classList.add('active');
  var seconds = 0;
  var timer = setInterval(function() {
    if (!voiceState.isCalling && !voiceState.isReceiving) { clearInterval(timer); return; }
    seconds++;
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;
    var el = document.getElementById('call-duration');
    if (el) el.textContent = (mins<10?'0':'')+mins+':'+(secs<10?'0':'')+secs;
  }, 1000);
  voiceState.isCalling = true;
  voiceState.isReceiving = false;
}
