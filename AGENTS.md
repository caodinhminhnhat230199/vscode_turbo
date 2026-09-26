# Workspace Rules — CodePulse

## Mandatory Verification Protocol (Sau mỗi prompt/task)
Sau khi thực hiện xong code cho bất kỳ yêu cầu/prompt nào, agent BẮT BUỘC:

1. **Syntax & Type Check**:
   - Chạy `npm run compile` (`tsc -p ./ --noEmit`).
   - Chạy `npm run lint` (`eslint src --ext ts`).
   - Sửa ngay nếu có syntax/type error.

2. **Code Format Check**:
   - Chạy `npm run format` để auto-format bằng Prettier.
   - Chạy `npm run format:check` để xác nhận toàn bộ file sạch sẽ, đúng chuẩn.

3. **Regression & Test Check**:
   - Chạy `npm test`. Mọi unit test phải pass.

4. **Fix All**:
   - Không được để tồn đọng bất kỳ warning/lỗi syntax/format nào.
