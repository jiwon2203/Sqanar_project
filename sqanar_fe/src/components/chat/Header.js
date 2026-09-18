// components/chat/Header.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useSettings } from '../../state/useSettings';
import CustomText from '../../../CustomText';

export default function Header({ title, onBack, onMenu }) {
  const { palette, baseFont } = useSettings();
  return (
    <View style={[s.bar, { borderBottomColor: palette.border, backgroundColor: palette.card }]}>
      <TouchableOpacity onPress={onBack}><Icon name="close" size={28} color={palette.text} /></TouchableOpacity>
      <CustomText style={[s.title, { color: palette.text, fontSize: Math.max(14, baseFont) }]}>{title}</CustomText>
      <TouchableOpacity onPress={onMenu}><Icon name="menu" size={26} color={palette.text} /></TouchableOpacity>
    </View>
  );
}
const s = StyleSheet.create({
  bar:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:12, borderBottomWidth:1, borderBottomColor:'#eee' },
  title:{ fontSize:16, fontWeight:'700' },
});
