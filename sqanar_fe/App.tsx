/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SettingsProvider, useSettings } from './src/state/useSettings';
import { DefaultTheme, DarkTheme, Theme } from '@react-navigation/native';
import BottomTabNavigator from './src/navigation/BottomTab';
import StartScreen from './src/screens/Start';
import LoginFormScreen from './src/screens/auth/LoginForm';
import SignUpScreen from './src/screens/auth/SignUp';
import ResetPWScreen from './src/screens/auth/ResetPw';
// import GuestLoginScreen from './src/screens/auth/GuestLogin';
import UpdateProfileScreen from './src/screens/auth/UpdateProfile';
import HomeScreen from './src/screens/Home';
import ChatHistory from './src/screens/ChatBot/ChatHistory';
import QRCameraScreen from './src/screens/QRCameraScreen';
import ReportBoard from './src/screens/board/ReportBoard'
import ChatbotScreen from './src/screens/ChatBot/ChatbotScreen';
import ReportScreen from './src/screens/board/ReportScreen'; 
import ReportDetailScreen from './src/screens/board/ReportDetailScreen';
import NoticeScreen from './src/screens/Notice';
import FAQ from './src/screens/FAQ';
import Logo from './assets/images/logo.png';

export type RootStackParamList = {
  Splash: undefined;
  Start: undefined;
  MainTab: undefined;
  LoginForm: undefined;
  SignUp: undefined;
  ResetPW: undefined;
  GuestLogin: undefined;
  UpdateProfile: undefined;
  Home: undefined;
  ChatHistory: undefined;
  QRCamera: undefined;
  ReportBoard: undefined;
  Chatbot: undefined;
  ReportScreen: undefined; 
  ReportDetailScreen: { reportId: number; url: string }; 
  NoticeScreen: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const SplashScreen = ({ navigation }: any) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('MainTab');
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* <Text style={styles.title}>sQanaR</Text> */}
      <Image source={Logo}
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );
};

/* 테마에 맞춘 네비게이션 래퍼 */
const ThemedNav: React.FC = () => {                      
  const { theme } = useSettings();                       
  const navTheme: Theme = theme === 'dark' ? DarkTheme : DefaultTheme; 
  return (                                               
    <>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="Start" component={StartScreen} />
          <Stack.Screen name="MainTab" component={BottomTabNavigator} />
          <Stack.Screen name="LoginForm" component={LoginFormScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
          <Stack.Screen name="ResetPW" component={ResetPWScreen} />
          {/* <Stack.Screen name="GuestLogin" component={GuestLoginScreen} /> */}
          <Stack.Screen name="UpdateProfile" component={UpdateProfileScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="ChatHistory" component={ChatHistory} />
          <Stack.Screen name="QRCamera" component={QRCameraScreen} />
          <Stack.Screen name="ReportBoard" component={ReportBoard} />
          <Stack.Screen name="Chatbot" component={ChatbotScreen} />
          <Stack.Screen name="ReportScreen" component={ReportScreen} />
          <Stack.Screen name="ReportDetailScreen" component={ReportDetailScreen} />
          <Stack.Screen name="NoticeScreen" component={NoticeScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
};

function App() {
  return (
    <SettingsProvider>
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ThemedNav />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </SettingsProvider>
  );
}


const styles = StyleSheet.create({
  container: { 
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff', 
  }, 
  title: { fontSize: 30, color: '#333333',},
  logo: { width: 200, height: 200, },
});

export default App;
