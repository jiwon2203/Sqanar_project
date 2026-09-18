import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, LayoutAnimation, Platform, UIManager } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// 안드로이드에서 애니메이션 활성화
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQ = () => {
  const [activeIndex, setActiveIndex] = useState(null);

  const faqs = [
    {
      question: "이 앱은 어떤 기능을 하나요?",
      answer:
        "QR 코드 또는 URL을 스캔하여 피싱 사이트나 악성 링크 여부를 자동으로 분석합니다. AI 기반으로 안전/주의/위험 단계를 판단합니다.",
    },
    {
      question: "스캔 결과는 어디서 확인할 수 있나요?",
      answer:
        "하단 내비게이션의 '히스토리' 메뉴에서 이전에 스캔했던 결과를 모두 확인할 수 있습니다.",
    },
    {
      question: "주의 단계는 어떤 의미인가요?",
      answer:
        "URL이 완전히 안전하지도, 명확히 악성으로 판정되지도 않은 경우입니다. 사용 시 주의가 필요하며, 로그인이나 결제는 피하는 것이 좋습니다.",
    },
    {
      question: "분석이 오래 걸리는 이유는 무엇인가요?",
      answer:
        "서버에서 URL의 구조, 도메인 등록 정보(WHOIS), 웹 콘텐츠, AI 임베딩 분석을 동시에 수행하기 때문입니다. 일반적으로 2~4초 정도 소요됩니다.",
    },
    {
      question: "개인정보는 저장되나요?",
      answer:
        "아니요. 사용자가 입력한 URL 또는 QR 정보는 분석 이후 즉시 삭제되며, 개인 식별 정보는 저장되지 않습니다.",
    },
  ];

  const toggleExpand = (index) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>❓ 자주 묻는 질문 (FAQ)</Text>

      {faqs.map((item, index) => (
        <View key={index} style={styles.faqItem}>
          <TouchableOpacity style={styles.questionRow} onPress={() => toggleExpand(index)}>
            <Text style={styles.question}>{item.question}</Text>
            <Ionicons
              name={activeIndex === index ? "chevron-up" : "chevron-down"}
              size={20}
              color="#333"
            />
          </TouchableOpacity>
          {activeIndex === index && <Text style={styles.answer}>{item.answer}</Text>}
        </View>
      ))}
    </ScrollView>
  );
};

export default FAQ;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  header: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 16,
    textAlign: "center",
  },
  faqItem: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  questionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  question: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    color: "#222",
  },
  answer: {
    fontSize: 14,
    color: "#555",
    marginTop: 10,
    lineHeight: 20,
  },
});
