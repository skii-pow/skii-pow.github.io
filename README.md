# Hướng nghiệp Hệ 9+

## Chạy trên máy

```sh
npm install
npm start
```

Mở `http://localhost:3000`. Trang chủ được phục vụ tại đường dẫn gốc nên không cần thêm `.html`.

Để mở trên điện thoại hoặc máy tính cùng Wi-Fi, lấy địa chỉ IP LAN của máy chạy máy chủ rồi truy cập `http://<IP-LAN>:3000`. Máy chủ lắng nghe trên mọi giao diện mạng; tường lửa của macOS cần cho phép Node.js nhận kết nối.

Muốn truy cập từ mạng bên ngoài, cần triển khai ứng dụng lên máy chủ có địa chỉ HTTPS công khai. Chỉ chia sẻ IP LAN không làm trang truy cập được qua Internet. Nền tảng triển khai cần có ổ đĩa bền vững cho thư mục `.private`, nơi lưu tài khoản và phiên đăng nhập.

## Kết nối Gemini

Tạo API key trong Google AI Studio, sau đó đặt các biến môi trường trong terminal hoặc phần quản lý Secrets của máy chủ triển khai:

```sh
read -s 'GEMINI_API_KEY?Nhap khoa Gemini moi (se khong hien tren man hinh): '
export GEMINI_API_KEY
export AI_PROVIDER=gemini
export GEMINI_MODEL=gemini-2.5-flash
PORT=3001 npm start
```

Nếu có `GEMINI_API_KEY` mà không đặt `AI_PROVIDER`, máy chủ tự chọn Gemini. Có thể đặt `AI_PROVIDER=openai` cùng `AI_API_KEY`, `AI_API_URL` và `AI_MODEL` để dùng endpoint tương thích OpenAI Chat Completions.

Trang web chỉ gọi server trung gian `/api/ai/*`; khóa không được gửi xuống trình duyệt. Server gửi khóa tới Gemini qua HTTPS trong header `x-goog-api-key`, không đặt khóa trong URL. Giới hạn endpoint AI ở 20 yêu cầu mỗi giờ trên mỗi IP.

Khóa vừa được gửi trong cuộc trò chuyện đã bị lộ: hãy thu hồi khóa đó trong Google AI Studio ngay và chỉ tạo khóa mới sau khi thu hồi. Giới hạn khóa mới chỉ dùng Generative Language API; khi triển khai có IP máy chủ cố định, hãy giới hạn thêm theo IP. Chỉ đặt khóa bằng biến môi trường hoặc Secrets của nền tảng triển khai; không dán vào HTML/JavaScript, chat, ảnh chụp màn hình hay Git. `.env` và thư mục tài khoản `.private` đã nằm trong `.gitignore`.

Tài khoản hiện xác thực bằng email và mật khẩu băm `scrypt`, với cookie phiên `HttpOnly`. Chức năng xác minh email, khôi phục mật khẩu và đăng nhập Google/Apple cần cấu hình thêm nhà cung cấp email/OAuth trước khi bật.