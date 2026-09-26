---
trigger: always_on
---

# Mandatory Post-Task Quality & Verification Rule

Mọi tác vụ hoặc câu lệnh (prompt/task) sau khi code xong BẮT BUỘC phải thực hiện quy trình kiểm tra và sửa lỗi trước khi bàn giao:

## 1. Kiểm tra cú pháp và kiểu (Syntax & TypeCheck)
- Chạy `npm run compile` (`tsc -p ./ --noEmit`).
- Chạy `npm run lint` (`eslint src --ext ts`).
- Không được để sót bất kỳ syntax error hoặc type error nào.

## 2. Kiểm tra format code (Formatting)
- Chạy `npm run format` (`prettier --write "src/**/*.ts" "test/**/*.ts"`).
- Đảm bảo tất cả code tuân thủ cấu hình [`.prettierrc`](file:///d:/AI_Workspace/vscode_turbo/.prettierrc).
- Kiểm tra lại với `npm run format:check`.


## 3. zero problems in project
- Kiểm tra và fix toàn bộ problem đang có của dự án
- Đảm bảo toàn bộ dự án zero problems

## 4. Kiểm tra kiểm thử (Unit Tests)
- Chạy `npm test` (`npm run compile && npm run test:unit`).
- Đảm bảo toàn bộ test case pass 100%.

## 5. Tự động khắc phục (Fix All)
- Nếu phát hiện bất kỳ lỗi cú pháp, lint, type hoặc formatting nào, phải tự động sửa triệt để trước khi báo hoàn thành cho người dùng.
