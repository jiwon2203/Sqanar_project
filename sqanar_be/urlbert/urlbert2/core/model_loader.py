# # /home/kong/urlbert/url_bert/urlbert2/core/model_loader.py
# import torch
# import torch.nn as nn
# from transformers import AutoConfig, AutoModelForMaskedLM
# from pytorch_pretrained_bert import BertTokenizer 

# # config.py에서 필요한 모든 설정 값들을 임포트합니다.
# from config import (
#     VOCAB_FILE_PATH, BERT_CONFIG_DIR, BERT_PRETRAINED_MODEL_PATH,
#     CLASSIFIER_MODEL_PATH, DEVICE, BERT_CONFIG_KWARTS
# )

# # 전역 변수로 모델과 토크나이저 저장 
# global_tokenizer = None
# global_model = None

# # --- 모델 클래스 정의  ---
# class BertForSequenceClassification(nn.Module):
#     def __init__(self, bert, freeze=False):
#         super(BertForSequenceClassification, self).__init__()
#         self.bert = bert
#         # 모든 BERT 파라미터는 학습 가능하게 설정
#         for name, param in self.bert.named_parameters():
#             param.requires_grad = True
#         self.dropout = nn.Dropout(p=0.1)
#         self.classifier = nn.Linear(768, 2)

#     def forward(self, x):
#         context = x[0]
#         types = x[1]
#         mask = x[2]
#         outputs = self.bert(context, attention_mask=mask, token_type_ids=types, output_hidden_states=True)
#         hidden_states = outputs.hidden_states[-1][:,0,:] # [CLS] 토큰 hidden state
#         out = self.dropout(hidden_states)
#         out = self.classifier(out)
#         return out

# def load_inference_model():
#     """
#     애플리케이션 시작 시 모델과 토크나이저를 한 번 로드하는 함수.
#     이 함수는 global_tokenizer와 global_model을 초기화하고 반환합니다.
#     """
#     global global_tokenizer, global_model

#     if global_model is not None and global_tokenizer is not None:
#         print("모델과 토크나이저가 이미 로드되어 있습니다.")
#         return global_model, global_tokenizer 

#     print("모델 및 토크나이저 로드 시작 (앱 초기화)...")
    
#     # 1. Tokenizer 로드 
#     current_tokenizer = BertTokenizer(VOCAB_FILE_PATH) 

#     # 2. BERT Config 로드
#     config = AutoConfig.from_pretrained(BERT_CONFIG_DIR, **BERT_CONFIG_KWARTS)

#     # 3. AutoModelForMaskedLM 로드
#     bert_model_for_loading = AutoModelForMaskedLM.from_config(config=config)
#     bert_model_for_loading.resize_token_embeddings(BERT_CONFIG_KWARTS["vocab_size"])

#     # 4. 기존 BERT 모델의 가중치 로드 
#     bert_dict = torch.load(BERT_PRETRAINED_MODEL_PATH, map_location=torch.device("cpu"))
#     bert_model_for_loading.load_state_dict(bert_dict)

#     # 5. 분류 모델 초기화 및 학습된 가중치 로드
#     current_model = BertForSequenceClassification(bert_model_for_loading)
#     current_model.bert.cls = nn.Sequential() # MaskedLM 헤드 제거 
#     current_model.load_state_dict(torch.load(CLASSIFIER_MODEL_PATH, map_location=DEVICE))
#     current_model.to(DEVICE)
#     current_model.eval() # 추론 모드 설정 

#     print("모델 로드 완료.")
    
#     # 전역 변수에 할당 
#     global_tokenizer = current_tokenizer
#     global_model = current_model
    
#     return global_model, global_tokenizer # 로드된 모델과 토크나이저를 반환

# urlbert/urlbert2/core/model_loader.py

import torch
import torch.nn as nn
from transformers import AutoConfig, AutoModelForMaskedLM
from pytorch_pretrained_bert import BertTokenizer

# config.py 파일에서 경로 및 설정값들을 가져옵니다.
from config import (
    VOCAB_FILE_PATH,
    BERT_CONFIG_DIR,
    BERT_CONFIG_KWARTS,
    BERT_PRETRAINED_MODEL_PATH,
    CLASSIFIER_MODEL_PATH,
    DEVICE,
    SEED
)

# 시드 고정 (재현성을 위해)
torch.manual_seed(SEED)
torch.cuda.manual_seed_all(SEED)
class BertForSequenceClassification(nn.Module):
    def __init__(self, bert):
        super(BertForSequenceClassification, self).__init__()
        self.bert = bert
        for name, param in self.bert.named_parameters():
            param.requires_grad = True
        self.dropout = nn.Dropout(p=0.1)
        self.classifier = nn.Linear(768, 2)  # BERT hidden_size=768, 클래스=2개(benign, malicious)

    def forward(self, x):
        context, types, mask = x[0], x[1], x[2]
        # Transformers 라이브러리 버전에 따라 outputs 형식이 다를 수 있으므로,
        # 'output_hidden_states=True' 옵션과 반환값을 확인해야 합니다.
        outputs = self.bert(context, attention_mask=mask, token_type_ids=types, output_hidden_states=True)
        
        # 마지막 레이어의 [CLS] 토큰 hidden state를 사용합니다.
        hidden_states = outputs.hidden_states[-1][:, 0, :]
        
        out = self.dropout(hidden_states)
        out = self.classifier(out)
        return out

def load_model_and_tokenizer():
    """
    URL-BERT 모델과 토크나이저를 로드하는 함수.
    테스트 코드(url.py)와 동일한, 검증된 방식으로 모델을 로드합니다.
    """
    print("URL-BERT 모델 및 토크나이저 로드 시작...")

    # 1. 토크나이저 로드
    tokenizer = BertTokenizer(VOCAB_FILE_PATH)

    # 2. BERT Config 로드
    config = AutoConfig.from_pretrained(BERT_CONFIG_DIR, **BERT_CONFIG_KWARTS)

    # 3. 기본 BERT 모델(MaskedLM) 로드
    bert_model_for_loading = AutoModelForMaskedLM.from_config(config=config)
    bert_model_for_loading.resize_token_embeddings(BERT_CONFIG_KWARTS["vocab_size"])

    # 4. 사전 학습된 urlBERT 가중치 로드
    bert_dict = torch.load(BERT_PRETRAINED_MODEL_PATH, map_location=torch.device("cpu"))
    bert_model_for_loading.load_state_dict(bert_dict)

    # 5. 분류 모델 초기화 및 불필요한 헤드 제거
    model = BertForSequenceClassification(bert_model_for_loading)
    model.bert.cls = nn.Sequential()  # MaskedLM 헤드 제거

    # 6. 최종 파인튜닝된 분류기 가중치 로드
    model.load_state_dict(torch.load(CLASSIFIER_MODEL_PATH, map_location=DEVICE))
    model.to(DEVICE)
    
    # 7. 추론 모드로 설정
    model.eval()

    print("URL-BERT 모델 로드 완료.")
    return model, tokenizer

# --- 전역 변수로 모델과 토크나이저를 관리 ---
# 앱이 시작될 때 한 번만 로드하여 메모리에 상주시키면 매번 로드할 필요가 없습니다.
GLOBAL_MODEL, GLOBAL_TOKENIZER = load_model_and_tokenizer()