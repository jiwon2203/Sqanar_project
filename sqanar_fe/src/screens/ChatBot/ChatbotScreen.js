// screens/ChatBot/ChatbotScreen.js
//import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Header from '../../components/chat/Header';
import MessageBubble from '../../components/chat/MessageBubble';
import QRHistory from './QRHistory';
import Composer from '../../components/chat/Composer';
import apiClient from '../../../api/apiClient';
import { sendChat, saveChatHistory, getChatSession, setChatSessionId } from '../../../api/chat'; 
import { useSettings } from '../../state/useSettings';
import CustomText from '../../../CustomText';

export default function ChatbotScreen({ navigation, route }) { // route로 restore 처리
  const [userId, setUserId] = useState(null); // 사용자 ID
  const [nickname, setNickname] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(false);

  const [composerValue, setComposerValue] = useState('');
  const [qrOpen, setQROpen] = useState(false);

  const listRef = useRef(null);
  const sessionIdRef = useRef(null); // 세션 ID 저장용 ref
  const scrollToEnd = () => setTimeout(() => listRef.current?.scrollToEnd({ animated:true }), 50);

  const { palette, baseFont } = useSettings();
  const dyn = {
    bg:   { backgroundColor: palette.bg },
    card: { backgroundColor: palette.card, borderColor: palette.border, borderWidth: 1 },
    text: { color: palette.text, fontSize: baseFont },
    sub:  { color: palette.sub,  fontSize: Math.max(12, baseFont - 2) },
  };

  const extractUserContext = (data) => {
    const isMember = data?.is_logged_in;
    if (isMember) {
      return {
          id: String(data.user_id || data.id), // user_id 또는 id를 사용
          nickname: data.nickname || '사용자',
          sGuest: false
      };
    }
    return {
      id: 'guest',
      nickname: '게스트',
      isGuest: true
    };
  };

  useFocusEffect(
    useCallback(() => {
      const restoreId = route.params?.restoreSessionId;

      if (restoreId) {
        // --- 시나리오 1: 과거 대화 이어가기 ---
        // restoreId가 있으면, DB에서 과거 기록을 불러옵니다.
        console.log(`과거 대화(ID: ${restoreId})를 이어갑니다.`);
        setLoading(true);
        
        getChatSession(restoreId)
          .then(sessionData => {
            if (sessionData?.messages) {
              setMessages(sessionData.messages);
              // sessionIdRef도 DB의 ID로 설정합니다.
              sessionIdRef.current = restoreId;
            }
          })
          .catch(e => console.error('Failed to restore chat session:', e))
          .finally(() => {
            setLoading(false);
            scrollToEnd();
          });

        // 한 번 사용한 restoreId는 정리합니다.
        navigation.setParams({ restoreSessionId: undefined });
      } else {
        // --- 시나리오 2: 새 대화 시작 ---
        console.log("새 대화를 시작합니다.");
      }
      // 화면이 포커스될 때마다 사용자 정보를 갱신합니다.
      (async () => {
      try {
        const { data } = await apiClient.get('/auth/me');
        const userContext = extractUserContext(data);
        
        setUserId(userContext.id);
        setNickname(userContext.nickname);
      } catch (e) {
        setUserId('guest');
        setNickname('게스트');
      }
    })();
    }, [route.params?.restoreSessionId])
  );

// useEffect(() => {
//     (async () => {
//         try {
//          const { data } = await apiClient.get('/auth/me'); 

//         // 새로운 로직 적용:
//         const userContext = extractUserContext(data); 

//         setUserId(userContext.id);
//         setNickname(userContext.nickname);

//         } catch (e) {
//         // 서버 연결 실패 시 게스트로 설정 유지
//         setUserId('guest');
//         setNickname('게스트');
//     }
//     })();
//     }, []);


//   // 추가(2-1-1): 히스토리 복원 로직
//   useEffect(() => {
//     const restoreSessionId = route.params?.restoreSessionId;
//     if (restoreSessionId) {
//       setMessages([]);
//       setLoading(true);

//       setChatSessionId(restoreSessionId); 

//       getChatSession(restoreSessionId)
//         .then(sessionData => { if (sessionData?.messages) setMessages(sessionData.messages); })
//         .catch(e => console.error('Failed to restore chat session:', e))
//         .finally(() => { setLoading(false); scrollToEnd(); });
//       navigation.setParams({ restoreSessionId: undefined });
//     }
//   }, [route.params?.restoreSessionId]);



// // 변경(2-1): 화면이 포커스될 때마다 실행되는 로직 추가-----
// useFocusEffect(
//   useCallback(() => {
//     // 이 코드는 화면이 나타날 때마다 실행됩니다.

//     // 단, 히스토리에서 특정 대화를 이어가는 경우는 제외해야 합니다.
//     const isRestoring = route.params?.restoreSessionId;
    
//     if (!isRestoring) {
//       // 히스토리 복원 중이 아닐 때만 '새 대화'로 간주하고 모든 것을 초기화합니다.
//       console.log("새 대화 시작: 세션을 초기화합니다."); // 확인용 로그
//       sessionIdRef.current = null;
//       setMessages([]);
//     }

//   }, [route.params?.restoreSessionId])
// );

// -----------------------------------------------------

const onSend = async (text, meta = {}) => {
    if (!text?.trim()) return;

    const userMsg = { id: `${Date.now()}-u`, role: 'user', text, time: new Date().toISOString() };
    const newMessagesAfterUser = [...messages, userMsg];
    setMessages(newMessagesAfterUser);
    scrollToEnd();
    setLoading(true);

    let finalBotMsg = null;
    try {
        // const data = await sendChat({ message: text, meta });
        // // finalBotMsg = { id: `${Date.now()}-b`, role: 'assistant', text: data?.reply || '응답이 비어있어요.', variant: data?.variant, time: new Date().toISOString() };
        // finalBotMsg = { 
        //   id: `${Date.now()}-b`, 
        //   role: 'assistant', 
        //   text: data?.reply || '응답이 비어있어요.', 
        //   variant: data?.variant, 
        //   time: new Date().toISOString() 
        const payload = { 
            message: text, 
            meta, 
            session_id: sessionIdRef.current 
        };
        const data = await sendChat(payload);

        // 수정 2: 서버로부터 받은 새로운 session_id를 ref에 저장합니다.
        if (data?.session_id) {
            sessionIdRef.current = data.session_id;
        }
        finalBotMsg = { 
            id: `${Date.now()}-b`, 
            role: 'assistant', 
            text: data?.reply || '응답이 비어있어요.', 
            variant: data?.variant, 
            time: new Date().toISOString() 
        };
        setMessages([...newMessagesAfterUser, finalBotMsg]);
    } catch {
        finalBotMsg = { id: `${Date.now()}-e`, role: 'assistant', text: '오류가 발생했어요.', time: new Date().toISOString() };
        setMessages([...newMessagesAfterUser, finalBotMsg]); // 👈 setMessages 호출 (비동기)
    } finally {
        setLoading(false);
        scrollToEnd();

    // 변경(2-2): 로그인 사용자일 경우, 현재까지의 대화 전체를 저장/업데이트합니다.
    if (userId && userId !== 'guest') {
      const updatedMessages = [...newMessagesAfterUser, finalBotMsg].filter(Boolean); // 👈 여기서 메시지 배열을 직접 구성

      const historyPayload = {
        messages: updatedMessages,
        history_id: sessionIdRef.current // 또는 DB ID, 현재는 session_id로 통일
      };
        saveChatHistory( historyPayload )
        .catch(e => console.warn('saveChatHistory error', e?.message));
        }
    }
};

  const openChatHistory = () => {
    setMessages([]); 
    navigation.navigate('ChatHistory');
    };

  const showWelcome = messages.length === 0;
  
  const onBackToMainTab = () => {
    // navigation.reset({ index: 0, routes: [{ name: 'MainTab' }] });
    //navigation.navigate("Home");
    setMessages([]); 

    // 2. 현재 대화 세션 ID를 초기화하여 새 대화를 시작하도록 합니다.
    sessionIdRef.current = null; 
    navigation.goBack?.()
  };

  return (
    <SafeAreaView style={[styles.wrap, dyn.bg]}>
      <Header
        title="AI 챗봇 보안 비서"
        onBack={onBackToMainTab}
        onMenu={openChatHistory}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        {showWelcome ? (
          <View style={styles.welcomeWrap}>
            <View style={[styles.welcomeCard, dyn.card]}>
              <View style={styles.avatar}>
                <Icon name="account-circle" size={56} color="#D9E5FF" />
              </View>
              <CustomText style={[styles.welcomeMain, dyn.text]}>안녕하세요 {nickname ? `${nickname}님` : ''}!</CustomText>
              <CustomText style={[styles.welcomeSub, dyn.sub]}>보안 설명이 필요하면 질문해 주세요.</CustomText>
            </View>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(it) => it.id}
            renderItem={({ item }) => (<MessageBubble {...item} />)}
            contentContainerStyle={styles.list}
            onContentSizeChange={scrollToEnd}
          />
        )}

        {loading && !showWelcome && (
          <View style={styles.typingWrap}>
            <ActivityIndicator size="small" />
            <CustomText style={[styles.typingText, dyn.sub]}>분석 중…</CustomText>
          </View>
        )}
        <Composer
          placeholder="Type a message..."
          onSend={onSend}
          onOpenQRHistory={() => setQROpen(true)}
          tooltip={showWelcome ? 'URL 기록 가져오기' : undefined}
          value={composerValue}
          onChangeText={setComposerValue}
        />
      </KeyboardAvoidingView>
      <QRHistory
        visible={qrOpen}
        onClose={() => setQROpen(false)}
        onPick={(item) => {
          setQROpen(false);
          if (item?.url) setComposerValue(item.url);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff' },
  list: { padding: 12, paddingBottom: 8 },
  welcomeWrap: { flex: 1, paddingHorizontal: 16, justifyContent: 'center' },
  welcomeCard: {
    alignItems: 'center', alignSelf: 'center',
    width: '88%', backgroundColor: '#F7F9FC', borderRadius: 16,
    paddingVertical: 28, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E6ECF2',
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFF', marginBottom: 12 },
  welcomeMain: { fontWeight: '700' },
  welcomeSub: { marginTop: 6 },
  typingWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 6 },
  typingText: { marginLeft: 8 }, // 💡 color/fontSize 제거
});
