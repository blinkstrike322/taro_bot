import requests
import json
from typing import List, Dict

def llm_query(cards: List[Dict]):
  response = requests.post(
    url="https://openrouter.ai/api/v1/chat/completions",
    headers={
      # "Authorization": "Bearer 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",
      "Authorization": "Bearer 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",
      "Content-Type": "application/json"
      # "HTTP-Referer": "<YOUR_SITE_URL>", # Optional. Site URL for rankings on openrouter.ai.
      # "X-Title": "<YOUR_SITE_NAME>", # Optional. Site title for rankings on openrouter.ai.
    },
    data=json.dumps({
      # "model": "deepseek/deepseek-chat-v3.1:free",
      "model": "tngtech/deepseek-r1t2-chimera:free",
      "messages": [
        {
          "role": "user",
          "content": "What is the meaning of life?"
        }
      ],
      
    })
  )

  # Check if the request was successful (status code 200)
  if response.status_code == 200:
      # Parse the JSON response
      api_response = response.json()
      
      # Print the full response for inspection
      # print(json.dumps(api_response, indent=2))
      
      # Extract and print just the generated message content (common use case)
      if 'choices' in api_response and len(api_response['choices']) > 0:
          message_content = api_response['choices'][0]['message']['content']
          print("\nGenerated Response:\n", message_content)
  else:
      # Handle errors (e.g., bad API key or rate limit)
      print(f"Error: {response.status_code} - {response.text}")