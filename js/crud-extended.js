function loadExpenses() {
  $.get(apiBase, data => {
    if (!Array.isArray(data)) {
      alert('Unexpected response format')
      return
    }

    const tbody = $('#expenses-table tbody')
    tbody.empty()

    data.forEach(e => {
      const safeAmount = !isNaN(e.amount) ? parseFloat(e.amount).toFixed(2) : '0.00'

      const row = $(`<tr>
        <td>${e.id}</td>
        <td>${e.title}</td>
        <td>${safeAmount}</td>
        <td>
          <button class="btn btn-sm btn-warning btn-edit">Edit</button>
          <button class="btn btn-sm btn-danger btn-delete">Del</button>
        </td>
      </tr>`)

      row.find('.btn-edit').click(() => {
        $('#expense-id').val(e.id)
        $('#expense-title').val(e.title)
        $('#expense-amount').val(e.amount)
        $('#btn-add').addClass('d-none')
        $('#btn-edit').removeClass('d-none')
      })

      row.find('.btn-delete').click(() => {
        window.currentDeleteId = e.id
        const modal = new bootstrap.Modal(document.getElementById('confirm-modal'))
        modal.show()
      })

      tbody.append(row)
    })
  }).fail(() => {
    alert('Failed to fetch expenses')
  })
}

$(document).ready(() => {
  loadExpenses()
  $('#btn-refresh').click(() => loadExpenses())
  bindCRUDButtons()
})
